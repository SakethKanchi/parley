// test/secrets.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upsertEnvLine, setProviderKey, secretStatus, isSecretProvider } from '../src/store/secrets.js';

test('upsertEnvLine replaces an existing key in place', () => {
  const text = 'A=1\nGEMINI_API_KEY=old\nB=2\n';
  const out = upsertEnvLine(text, 'GEMINI_API_KEY', 'new');
  assert.equal(out, 'A=1\nGEMINI_API_KEY=new\nB=2\n');
});

test('upsertEnvLine replaces an empty/commented-style key', () => {
  const text = 'GEMINI_API_KEY=\nB=2\n';
  assert.equal(upsertEnvLine(text, 'GEMINI_API_KEY', 'abc'), 'GEMINI_API_KEY=abc\nB=2\n');
});

test('upsertEnvLine appends a missing key with a trailing newline', () => {
  assert.equal(upsertEnvLine('A=1', 'OPENAI_API_KEY', 'sk'), 'A=1\nOPENAI_API_KEY=sk\n');
  assert.equal(upsertEnvLine('', 'OPENAI_API_KEY', 'sk'), 'OPENAI_API_KEY=sk\n');
});

test('isSecretProvider only true for keyed providers', () => {
  assert.equal(isSecretProvider('gemini'), true);
  assert.equal(isSecretProvider('openai'), true);
  assert.equal(isSecretProvider('opencode'), true);
  assert.equal(isSecretProvider('ollama'), false);
  assert.equal(isSecretProvider('fake'), false);
});

test('setProviderKey updates live config + persists to .env, and clears it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-secrets-'));
  const envPath = join(dir, '.env');
  writeFileSync(envPath, 'DISCORD_TOKEN=x\nGEMINI_API_KEY=\n');
  // Fake in-memory config mirroring src/config/env.js shape.
  const env = { gemini: { apiKey: undefined }, openai: {}, opencode: {} };

  let status = await setProviderKey('gemini', '  my-key  ', { env, envPath });
  assert.equal(env.gemini.apiKey, 'my-key'); // trimmed + applied live
  assert.equal(status.gemini, true);
  assert.match(readFileSync(envPath, 'utf8'), /GEMINI_API_KEY=my-key/);

  status = await setProviderKey('gemini', '', { env, envPath });
  assert.equal(env.gemini.apiKey, undefined); // cleared live
  assert.equal(status.gemini, false);
  assert.match(readFileSync(envPath, 'utf8'), /GEMINI_API_KEY=\n/);

  rmSync(dir, { recursive: true, force: true });
});

test('setProviderKey rejects a non-keyed provider', async () => {
  await assert.rejects(() => setProviderKey('ollama', 'x', { env: {}, envPath: '/tmp/none' }),
    /no editable API key/);
});
