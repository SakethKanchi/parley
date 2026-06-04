import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { getGuildConfig, setGuildConfig, DEFAULTS } from '../src/store/config.js';

test('getGuildConfig returns defaults for unknown guild', () => {
  const db = openDb(':memory:');
  assert.deepEqual(getGuildConfig(db, 'g'), { guildId: 'g', ...DEFAULTS });
});

test('setGuildConfig merges and persists partial updates', () => {
  const db = openDb(':memory:');
  setGuildConfig(db, 'g', { summarizerProvider: 'ollama', whisperModel: 'medium' });
  const c = getGuildConfig(db, 'g');
  assert.equal(c.summarizerProvider, 'ollama');
  assert.equal(c.whisperModel, 'medium');
  assert.equal(c.autoJoin, DEFAULTS.autoJoin); // untouched default
});

test('setGuildConfig second update keeps prior values', () => {
  const db = openDb(':memory:');
  setGuildConfig(db, 'g', { summarizerProvider: 'ollama' });
  setGuildConfig(db, 'g', { language: 'es' });
  const c = getGuildConfig(db, 'g');
  assert.equal(c.summarizerProvider, 'ollama');
  assert.equal(c.language, 'es');
});
