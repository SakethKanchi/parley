import { createWriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
    mkdirSync(dirname(pcmPath), { recursive: true });

    const opusStream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 } });
    const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 320 });
    const out = createWriteStream(pcmPath);
    opusStream.pipe(decoder).pipe(out);

    registry.begin(userId, member.displayName, startMs, pcmPath, { opusStream, decoder, out });

    const end = () => { try { out.end(); } catch { /* ignore */ } try { opusStream.destroy(); } catch { /* ignore */ } registry.finish(userId); };
    opusStream.on('end', end);
    opusStream.on('error', end);
    decoder.on('error', end);
  });
}
