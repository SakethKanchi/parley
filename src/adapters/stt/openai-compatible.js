import { readFile as fsReadFile } from 'node:fs/promises';
import { basename } from 'node:path';

// One adapter for every OpenAI-compatible speech-to-text endpoint
// (POST {baseUrl}/audio/transcriptions). OpenAI and other OpenAI-compatible
// providers share this endpoint, but response formats depend on the model.
//
// Whisper supports verbose_json with word timestamps. GPT transcription
// models use JSON without timestamps; the pipeline uses the recorded
// audio duration when the normalized response has no words.
export function createOpenAICompatibleSTT({ baseUrl, apiKey, label = 'STT' }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const readFile = deps.readFile || fsReadFile;
  const retries = deps.retries ?? 1;
  // Cloud transcription is fast, but a cold connection or
  // a large file warrants headroom. Far below the sidecar's CPU-bound ceiling.
  const timeoutMs = deps.timeoutMs ?? 120_000;
  const url = `${String(baseUrl).replace(/\/+$/, '')}/audio/transcriptions`;

  return async function transcribe(filePath, opts = {}) {
    if (!apiKey) throw new Error(`${label}: API key is not set.`);
    const bytes = await readFile(filePath);
    const model = opts.model || 'whisper-1';
    const isGptTranscribe = model === 'gpt-transcribe';
    const jsonOnly = isGptTranscribe || /^gpt-4o(?:-mini)?-transcribe(?:-|$)/.test(model);
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const form = new FormData();
        form.append('file', new Blob([bytes]), basename(filePath));
        form.append('model', model);
        form.append('response_format', jsonOnly ? 'json' : 'verbose_json');
        if (!jsonOnly) form.append('timestamp_granularities[]', 'word');
        // Only send a language hint when the user picked an ISO code. The new
        // gpt-transcribe model takes languages[] instead of singular language.
        if (opts.language && opts.language !== 'auto') {
          form.append(isGptTranscribe ? 'languages[]' : 'language', opts.language);
        }
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const err = new Error(`${label} HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
          err.status = res.status;
          // Re-uploading an invalid request cannot fix it. Keep retries for
          // timeouts, rate limits, server errors, and network failures.
          err.noRetry = res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status);
          throw err;
        }
        return normalize(await res.json());
      } catch (err) {
        lastErr = err;
        if (err?.noRetry) break;
      }
    }
    throw lastErr;
  };
}

// Coerce an OpenAI-compatible transcription response into our { text, words } shape.
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
  return { text, words, language: json?.language ?? json?.languages?.[0]?.code };
}
