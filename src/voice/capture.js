import { createWriteStream, mkdirSync } from 'node:fs';
import prism from 'prism-media';
import { EndBehaviorType } from '@discordjs/voice';
import { pcmName } from './audio.js';

// Pure bookkeeping of per-user tracks for a single meeting; unit-testable.
export class TrackRegistry {
  constructor() { this.active = new Map(); this.done = []; }
  isActive(userId) { return this.active.has(userId); }
  begin(userId, displayName, startMs, pcmPath, handles = {}) {
    this.active.set(userId, { userId, displayName, startMs, pcmPath, ...handles });
  }
  finish(userId) {
    const t = this.active.get(userId);
    if (!t) return null;
    this.active.delete(userId);
    this.done.push({ userId: t.userId, displayName: t.displayName, startMs: t.startMs, pcmPath: t.pcmPath });
    return t;
  }
  list() { return [...this.done]; }
}

// Side-effecting wiring used by MeetingManager. Not unit-tested (needs a live
// voice connection); validated by the manual integration checklist.
export function attachCapture({ connection, guild, audioDir, registry, now = () => Date.now() }) {
  mkdirSync(audioDir, { recursive: true });
  connection.receiver.speaking.on('start', (userId) => {
    if (registry.isActive(userId)) return;
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) return;

    const startMs = now();
    const pcmPath = `${audioDir}/${pcmName(userId, startMs)}`;

    const opusStream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 } });
    const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 320 });
    const out = createWriteStream(pcmPath);
    opusStream.pipe(decoder).pipe(out);

    const end = () => {
      try { out.end(); } catch { /* ignore */ }
      try { decoder.destroy(); } catch { /* ignore */ }
      try { opusStream.destroy(); } catch { /* ignore */ }
      registry.finish(userId);
    };

    registry.begin(userId, member.displayName, startMs, pcmPath, { opusStream, decoder, out, end });

    opusStream.on('end', end);
    opusStream.on('error', end);
    decoder.on('error', end);
  });

  return {
    // End every still-active speaking turn and wait for its PCM to flush, so a
    // manual /leave or auto-leave never loses the final in-flight utterance.
    async stopAll() {
      const actives = [...registry.active.values()];
      await Promise.all(actives.map((t) => new Promise((resolve) => {
        if (t.out.writableFinished) { resolve(); return; }
        t.out.once('finish', resolve);
        t.out.once('close', resolve);
        t.end();
      })));
    },
  };
}
