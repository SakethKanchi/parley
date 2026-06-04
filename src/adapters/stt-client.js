import { readFile as fsReadFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { config } from '../config/env.js';

export async function transcribeFile(filePath, opts = {}, deps = {}) {
  const baseUrl = deps.baseUrl || config.sttUrl;
  const fetchImpl = deps.fetchImpl || fetch;
  const readFile = deps.readFile || fsReadFile;
  const retries = deps.retries ?? 1;
  // Generous: one call transcribes a whole speaking turn, which on CPU can take
  // minutes for the larger models. This only fires on a stalled (silent) sidecar;
  // a dead one fails fast with ECONNREFUSED. Tunable via deps.timeoutMs.
  const timeoutMs = deps.timeoutMs ?? 600_000;

  const bytes = await readFile(filePath);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([bytes]), basename(filePath));
      form.append('model', opts.model || 'small');
      form.append('language', opts.language || 'auto');
      const res = await fetchImpl(`${baseUrl}/transcribe`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs),
      });
      // A non-OK HTTP status throws here and is caught below, so it is retried too.
      if (!res.ok) throw new Error(`STT sidecar HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
