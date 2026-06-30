import { convertPcmToWav } from '../voice/audio.js';
import { getSTT, resolveSttModel } from '../adapters/stt/index.js';
import { unlink } from 'node:fs/promises';

export async function transcribeTracks(tracks, cfg = {}, deps = {}) {
  const convert = deps.convert || convertPcmToWav;
  // Resolve the configured STT provider (sidecar | groq | openai) once per
  // meeting. The provider default can be overridden via deps.stt in tests.
  const transcribe = getSTT(cfg, deps.env, deps.sttDeps);
  const model = resolveSttModel(cfg);
  const stt = deps.stt || ((wav) => transcribe(wav, { model, language: cfg.language }));
  const cleanup = deps.cleanup || (async (p) => { try { await unlink(p); } catch { /* ignore */ } });

  const utterances = [];
  for (const t of tracks) {
    const wavPath = t.pcmPath.replace(/\.pcm$/, '.wav');
    try {
      await convert(t.pcmPath, wavPath);
      const { text, words } = await stt(wavPath, cfg);
      const clean = (text || '').trim();
      if (!clean) continue;
      const lastEnd = words && words.length ? words[words.length - 1].end : 0;
      utterances.push({
        userId: t.userId,
        displayName: t.displayName,
        startMs: t.startMs,
        endMs: t.startMs + Math.round(lastEnd * 1000),
        text: clean,
      });
    } finally {
      await cleanup(wavPath);
    }
  }
  return utterances;
}
