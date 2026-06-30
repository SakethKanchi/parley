// Live settings management for the web UI.
//
// Two classes of editable settings, all stored ONLY in the .env file
// (DATA_DIR/.env so they persist across restarts) and applied to the in-memory
// `config` singleton so changes take effect without an env reload:
//
//   • Provider API keys      — GEMINI/OPENAI/OPENCODE_API_KEY  (secret: presence-only)
//   • Connection settings    — DISCORD_TOKEN, DISCORD_CLIENT_ID, STT_URL
//
// Security: the web server binds 127.0.0.1 only. Secret values (API keys, the
// Discord token) are NEVER returned to the client — only whether they are set.
// Non-secret settings (client id, STT url) are returned as-is so the UI can
// show and edit them.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config, resolveEnvFile } from '../config/env.js';

// provider -> { env: ENV_VAR_NAME, apply(config, value) }
const PROVIDER_SECRETS = {
  gemini: { env: 'GEMINI_API_KEY', apply: (c, v) => { c.gemini.apiKey = v; } },
  openai: { env: 'OPENAI_API_KEY', apply: (c, v) => { c.openai.apiKey = v; } },
  opencode: { env: 'OPENCODE_API_KEY', apply: (c, v) => { c.opencode.apiKey = v; } },
};

// Core connection settings. `secret: true` means the value is never returned to
// the client (the Discord token), only its presence.
const CONNECTION_SETTINGS = {
  discordToken: { env: 'DISCORD_TOKEN', secret: true, apply: (c, v) => { c.discordToken = v; } },
  discordClientId: { env: 'DISCORD_CLIENT_ID', secret: false, apply: (c, v) => { c.discordClientId = v; } },
  sttUrl: { env: 'STT_URL', secret: false, apply: (c, v) => { c.sttUrl = v || 'http://127.0.0.1:8000'; } },
};

export function isSecretProvider(provider) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_SECRETS, provider);
}

/** Which providers have a key present right now (for the UI badges). */
export function secretStatus(env = config) {
  return {
    gemini: !!env.gemini.apiKey,
    openai: !!env.openai.apiKey,
    opencode: !!env.opencode.apiKey,
  };
}

/**
 * Upsert `KEY=value` in a .env file's text, preserving everything else. If the
 * key exists (even commented/empty) it's replaced in place; otherwise appended.
 */
export function upsertEnvLine(text, key, value) {
  const safe = String(value ?? '');
  const line = `${key}=${safe}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  const sep = text.length && !text.endsWith('\n') ? '\n' : '';
  return `${text}${sep}${line}\n`;
}

/** Persist a single KEY=value to the env file (creating it if needed). */
async function persistEnv(key, value, envPath) {
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
  await writeFile(envPath, upsertEnvLine(existing, key, value), 'utf8');
}

/**
 * Set (or clear) a provider's API key. Updates the in-memory config immediately
 * and persists to the env file. Returns the new secretStatus.
 *   provider: 'gemini' | 'openai' | 'opencode'
 *   value: string key, or '' to clear.
 */
export async function setProviderKey(provider, value, { env = config, envPath = resolveEnvFile() } = {}) {
  const spec = PROVIDER_SECRETS[provider];
  if (!spec) throw new Error(`Provider "${provider}" has no editable API key.`);
  const trimmed = String(value ?? '').trim();
  spec.apply(env, trimmed || undefined);                 // 1) live
  await persistEnv(spec.env, trimmed, envPath);          // 2) persisted
  return secretStatus(env);
}

/**
 * Current connection settings for the UI: presence for secrets, value for the
 * rest. Never leaks the Discord token.
 */
export function connectionStatus(env = config) {
  return {
    discordToken: { set: !!env.discordToken },
    discordClientId: { set: !!env.discordClientId, value: env.discordClientId || '' },
    sttUrl: { set: !!env.sttUrl, value: env.sttUrl || '' },
  };
}

/**
 * Apply a patch of connection settings. Only known keys are accepted. Each is
 * applied to the live config and persisted. A `secret` value of '' clears it.
 * Returns the new connectionStatus.
 */
export async function setConnection(patch = {}, { env = config, envPath = resolveEnvFile() } = {}) {
  const keys = Object.keys(patch).filter((k) => Object.prototype.hasOwnProperty.call(CONNECTION_SETTINGS, k));
  for (const k of keys) {
    const spec = CONNECTION_SETTINGS[k];
    const trimmed = String(patch[k] ?? '').trim();
    spec.apply(env, trimmed || undefined);
    await persistEnv(spec.env, trimmed, envPath);
  }
  return connectionStatus(env);
}

export { PROVIDER_SECRETS, CONNECTION_SETTINGS };
