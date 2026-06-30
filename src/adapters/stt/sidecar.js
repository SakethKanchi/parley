import { transcribeFile } from '../stt-client.js';

// The local faster-whisper sidecar provider. Thin wrapper over the existing
// stt-client so the resolver can treat every provider uniformly as
// `(filePath, { model, language }) => { text, words }`.
export function createSidecarSTT({ baseUrl }, deps = {}) {
  return function transcribe(filePath, opts = {}) {
    return transcribeFile(filePath, { model: opts.model, language: opts.language }, { ...deps, baseUrl });
  };
}
