// Live API-key management for the web Settings page.
//
// Keys live ONLY in the .env file (never the DB, never sent back to the client).
// This module updates the in-memory `config` singleton so a key set from the UI
// takes effect immediately (the summarizer adapters read `env.<provider>.apiKey`
// at call time), and persists it to .env so it survives a restart.
//
// Security: the web server binds 127.0.0.1 only. We expose *presence* of a key
// (set / not set) to the UI, never the value.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config/env.js';

// provider -> { env: ENV_VAR_NAME, apply(config, value) }
const PROVIDER_SECRETS = {
  gemini: { env: 'GEMINI_API_KEY', apply: (c, v) => { c.gemini.apiKey = v; } },
  openai: { env: 'OPENAI_API_KEY', apply: (c, v) => { c.openai.apiKey = v; } },
  opencode: { env: 'OPENCODE_API_KEY', apply: (c, v) => { c.opencode.apiKey = v; } },
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

/**
 * Set (or clear) a provider's API key. Updates the in-memory config immediately
 * and persists to .env. Returns the new secretStatus.
 *   provider: 'gemini' | 'openai' | 'opencode'
 *   value: string key, or '' to clear.
 */
export async function setProviderKey(provider, value, { env = config, envPath = '.env' } = {}) {
  const spec = PROVIDER_SECRETS[provider];
  if (!spec) throw new Error(`Provider "${provider}" has no editable API key.`);
  const trimmed = String(value ?? '').trim();

  // 1) live, in-memory
  spec.apply(env, trimmed || undefined);

  // 2) persist to .env
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
  const next = upsertEnvLine(existing, spec.env, trimmed);
  await writeFile(envPath, next, 'utf8');

  return secretStatus(env);
}

export { PROVIDER_SECRETS };
