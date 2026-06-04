import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDataDir, validateEnv } from '../src/config/env.js';

test('resolveDataDir prefers explicit DATA_DIR', () => {
  assert.equal(resolveDataDir({ DATA_DIR: '/tmp/x' }, () => false), '/tmp/x');
});

test('resolveDataDir falls back to /data when it exists', () => {
  assert.equal(resolveDataDir({}, (p) => p === '/data'), '/data');
});

test('resolveDataDir falls back to cwd when no /data', () => {
  assert.equal(resolveDataDir({}, () => false, '/work'), '/work');
});

test('validateEnv throws when required key missing', () => {
  assert.throws(() => validateEnv({ DISCORD_CLIENT_ID: 'x' }), /DISCORD_TOKEN/);
});

test('validateEnv passes with required keys', () => {
  assert.doesNotThrow(() => validateEnv({ DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c' }));
});
