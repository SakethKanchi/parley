import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ override: true });
const REQUIRED = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
export function resolveDataDir(env = process.env, exists = existsSync, cwd = process.cwd()) {
  if (env.DATA_DIR) return env.DATA_DIR;
  if (exists('/data')) return '/data';
  return cwd;
}
export function validateEnv(env = process.env) {
  const empty = REQUIRED.filter((k) => !env[k] || env[k].trim() === '');
  if (empty.length) throw new Error(`Missing or empty required env: ${empty.join(', ')}`);
  return true;
}

export const config = {
  dataDir: resolveDataDir(),
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  sttUrl: process.env.STT_URL || 'http://127.0.0.1:8000',
  gemini: { apiKey: process.env.GEMINI_API_KEY },
  openai: { apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1' },
  opencode: { apiKey: process.env.OPENCODE_API_KEY, baseUrl: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1' },
  ollama: { url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434' },
};
