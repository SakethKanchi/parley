import { readFile as fsReadFile } from 'node:fs/promises';
import { basename } from 'node:path';

// One adapter for every OpenAI-compatible speech-to-text endpoint
// (POST {baseUrl}/audio/transcriptions). Groq and OpenAI both speak this exact
// shape, so a single implementation covers them — only baseUrl/key/model differ.
//
// We always request `verbose_json` with word-level timestamps so the response
// carries the same `{ text, words: [{ word, start, end }] }` our pipeline
// already consumes from the local sidecar. No call-site changes needed.
export function createOpenAICompatibleSTT({ baseUrl, apiKey, label = 'STT' }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const readFile = deps.readFile || fsReadFile;
  const retries = deps.retries ?? 1;
  // Cloud transcription is fast (Groq ~200x realtime), but a cold connection or
  // a large file warrants headroom. Far below the sidecar's CPU-bound ceiling.
  const timeoutMs = deps.timeoutMs ?? 120_000;
  const url = `${String(baseUrl).replace(/\/+$/, '')}/audio/transcriptions`;

  return async function transcribe(filePath, opts = {}) {
    if (!apiKey) throw new Error(`${label}: API key is not set.`);
    const bytes = await readFile(filePath);
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const form = new FormData();
        form.append('file', new Blob([bytes]), basename(filePath));
        form.append('model', opts.model || 'whisper-large-v3-turbo');
        form.append('response_format', 'verbose_json');
        form.append('timestamp_granularities[]', 'word');
        // Whisper auto-detects language when none is supplied; only pin it when
        // the user picked a specific ISO code (our 'auto' sentinel means detect).
        if (opts.language && opts.language !== 'auto') form.append('language', opts.language);
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`${label} HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
        }
        return normalize(await res.json());
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  };
}

// Coerce an OpenAI/Groq transcription response into our { text, words } shape.
// Prefer top-level word timestamps; fall back to deriving them from segments so
// downstream endMs math still works even if a provider omits the words array.
export function normalize(json) {
  const text = (json?.text || '').trim();
  let words = Array.isArray(json?.words)
    ? json.words.map((w) => ({ word: w.word, start: w.start, end: w.end }))
    : [];
  if (!words.length && Array.isArray(json?.segments)) {
    words = json.segments
      .filter((s) => typeof s.end === 'number')
      .map((s) => ({ word: s.text, start: s.start, end: s.end }));
  }
  return { text, words, language: json?.language };
}
