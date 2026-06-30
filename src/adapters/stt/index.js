import { config as envConfig } from '../../config/env.js';
import { createSidecarSTT } from './sidecar.js';
import { createOpenAICompatibleSTT } from './openai-compatible.js';

// Pluggable speech-to-text, mirroring the summarizer adapter layout. Every
// provider resolves to a uniform `transcribe(filePath, { model, language })`
// returning `{ text, words: [{ word, start, end }] }`.
//
//   • sidecar — local faster-whisper container (default; fully offline, free)
//   • openai  — OpenAI / any OpenAI-compatible audio endpoint
//
// Cloud providers let users skip running the Python sidecar entirely.

export const STT_PROVIDERS = ['sidecar', 'openai'];

// Selectable models per provider, with the default first. The sidecar's models
// are faster-whisper sizes (downloaded on demand); cloud models are API IDs.
export const STT_MODELS = {
  sidecar: ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'],
  openai: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
};

export const STT_PROVIDER_LABELS = {
  sidecar: 'Local sidecar (faster-whisper)',
  openai: 'OpenAI (cloud)',
};

// The model a given config should use: cloud providers read `sttModel`
// (falling back to the provider default); the sidecar keeps using `whisperModel`
// so existing configs and the `/setup whisper_model` flow are untouched.
export function resolveSttModel(cfg, provider = cfg?.sttProvider) {
  if (provider === 'sidecar' || !provider) return cfg?.whisperModel || STT_MODELS.sidecar[0];
  return cfg?.sttModel || STT_MODELS[provider]?.[0];
}

// Build the transcribe function for a guild config. `deps` is forwarded to the
// underlying adapter (used by tests to inject fetch/readFile).
export function getSTT(cfg = {}, env = envConfig, deps = {}) {
  const provider = cfg.sttProvider || 'sidecar';
  switch (provider) {
    case 'sidecar':
      return createSidecarSTT({ baseUrl: env.sttUrl }, deps);
    case 'openai':
      return createOpenAICompatibleSTT({ baseUrl: env.openai?.baseUrl, apiKey: env.openai?.apiKey, label: 'OpenAI STT' }, deps);
    default:
      throw new Error(`Unknown STT provider: ${provider}`);
  }
}

// Whether a provider is usable right now (key/url present). Powers UI badges and
// the validation that blocks selecting a provider with no credentials.
export function sttProviderReady(provider, env = envConfig) {
  if (provider === 'sidecar') return { ok: !!env.sttUrl, missing: 'STT_URL' };
  if (provider === 'openai') return { ok: !!env.openai?.apiKey, missing: 'OPENAI_API_KEY' };
  return { ok: false, missing: null };
}

export function availableSttProviders(env = envConfig) {
  return STT_PROVIDERS.map((provider) => ({
    provider,
    label: STT_PROVIDER_LABELS[provider],
    models: STT_MODELS[provider],
    ...sttProviderReady(provider, env),
  }));
}
