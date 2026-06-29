import { SUPPORTED_PROVIDERS } from '../adapters/summarizer/index.js';
import { LANGUAGE_CODES, SUMMARY_LANGUAGE_VALUES } from '../adapters/summarizer/languages.js';

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'];

export function providerKeyPresent(provider, env) {
  if (provider === 'gemini') return { ok: !!env.gemini.apiKey, missing: 'GEMINI_API_KEY' };
  if (provider === 'openai') return { ok: !!env.openai.apiKey, missing: 'OPENAI_API_KEY' };
  if (provider === 'opencode') return { ok: !!env.opencode.apiKey, missing: 'OPENCODE_API_KEY' };
  if (provider === 'ollama') return { ok: !!env.ollama.url, missing: 'OLLAMA_URL' };
  return { ok: false, missing: null };
}

export function validateSetup(input, env) {
  const patch = {};

  if (input.provider !== undefined) {
    if (!SUPPORTED_PROVIDERS.includes(input.provider)) {
      return { ok: false, error: `Unknown provider "${input.provider}". Use one of: ${SUPPORTED_PROVIDERS.join(', ')}.` };
    }
    const key = providerKeyPresent(input.provider, env);
    if (!key.ok) return { ok: false, error: `Cannot use ${input.provider}: ${key.missing} is not set in .env.` };
    patch.summarizerProvider = input.provider;
    if (input.model) patch.summarizerModel = input.model;
  }

  if (input.whisperModel !== undefined) {
    if (!WHISPER_MODELS.includes(input.whisperModel)) {
      return { ok: false, error: `Invalid whisper model. Use one of: ${WHISPER_MODELS.join(', ')}.` };
    }
    patch.whisperModel = input.whisperModel;
  }

  if (input.notesChannelId !== undefined) patch.notesChannelId = input.notesChannelId;
  if (input.useThread !== undefined) patch.useThread = !!input.useThread;
  if (input.autoJoin !== undefined) patch.autoJoin = !!input.autoJoin;
  if (input.language !== undefined) {
    if (!LANGUAGE_CODES.has(input.language)) {
      return { ok: false, error: `Invalid language. Use one of: ${[...LANGUAGE_CODES].join(', ')}.` };
    }
    patch.language = input.language;
  }

  if (input.summary_language !== undefined) {
    if (!SUMMARY_LANGUAGE_VALUES.has(input.summary_language)) {
      return { ok: false, error: `Invalid summary language. Use one of: ${[...SUMMARY_LANGUAGE_VALUES].join(', ')}.` };
    }
    patch.summaryLanguage = input.summary_language;
  }

  return { ok: true, patch };
}

export { WHISPER_MODELS };

export function availableProviders(env) {
  return SUPPORTED_PROVIDERS.map((provider) => ({ provider, ...providerKeyPresent(provider, env) }));
}
