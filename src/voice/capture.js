import { createWriteStream, mkdirSync } from 'node:fs';
import prism from 'prism-media';
import { EndBehaviorType } from '@discordjs/voice';
import { pcmName } from './audio.js';

// Avoid splitting speaker turns on brief pauses; each split adds a separate STT request.
export const SPEAKER_SILENCE_MS = 3000;

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
// `onSpeaker(userId, displayName)` fires the first time a member speaks, so the
// caller can record latecomers who joined after the meeting started.
export function attachCapture({ connection, guild, audioDir, registry, now = () => Date.now(), onSpeaker = null }) {
  mkdirSync(audioDir, { recursive: true });

  const onStart = (userId) => {
    // The whole body is guarded: this runs inside a Discord voice event
    // emitter, so ANY synchronous throw here (e.g. a native opus module that
    // fails to load after a system libc upgrade) becomes an uncaught exception
    // that kills the entire process mid-meeting. Never let one bad speaking
    // turn take the bot down — log it and skip just that track.
    try {
      if (registry.isActive(userId)) return;
      const member = guild.members.cache.get(userId);
      if (!member || member.user.bot) return;

      const startMs = now();
      const pcmPath = `${audioDir}/${pcmName(userId, startMs)}`;

      const opusStream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SPEAKER_SILENCE_MS } });
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
      // Record anyone who actually speaks as an attendee (covers latecomers who
      // joined after the start-of-meeting snapshot). Idempotent downstream.
      if (onSpeaker) { try { onSpeaker(userId, member.displayName); } catch { /* ignore */ } }

      opusStream.on('end', end);
      opusStream.on('error', end);
      decoder.on('error', end);
    } catch (err) {
      console.error(`[capture] failed to start recording track for user ${userId}: ${err.message}`);
    }
  };

  connection.receiver.speaking.on('start', onStart);

  return {
    // End every still-active speaking turn and wait for its PCM to flush, so a
    // manual /leave or auto-leave never loses the final in-flight utterance.
    // Detach the listener FIRST so a new speaking-start between here and the
    // connection being destroyed can't open an untracked stream (leaked handle
    // + orphan .pcm + lost audio, since registry.list() was already snapshotted).
    async stopAll() {
      connection.receiver.speaking.off('start', onStart);
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
