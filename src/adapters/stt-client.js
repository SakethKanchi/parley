import { readFile as fsReadFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { config } from '../config/env.js';

export async function transcribeFile(filePath, opts = {}, deps = {}) {
  const baseUrl = deps.baseUrl || config.sttUrl;
  const fetchImpl = deps.fetchImpl || fetch;
  const readFile = deps.readFile || fsReadFile;
  const retries = deps.retries ?? 1;

  const bytes = await readFile(filePath);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([bytes]), basename(filePath));
      form.append('model', opts.model || 'small');
      form.append('language', opts.language || 'auto');
      const res = await fetchImpl(`${baseUrl}/transcribe`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`STT sidecar HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
