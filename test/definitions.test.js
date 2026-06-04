import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsJSON } from '../src/commands/definitions.js';

test('exports the six v1 commands as JSON', () => {
  const names = commandsJSON().map((c) => c.name).sort();
  assert.deepEqual(names, ['history', 'join', 'leave', 'search', 'setup', 'summary']);
});

test('search command has a required keyword option', () => {
  const search = commandsJSON().find((c) => c.name === 'search');
  const opt = search.options.find((o) => o.name === 'keyword');
  assert.equal(opt.required, true);
});

test('setup command exposes provider/model/whisper/thread/autojoin/channel/language options', () => {
  const setup = commandsJSON().find((c) => c.name === 'setup');
  const names = setup.options.map((o) => o.name).sort();
  assert.deepEqual(names, ['autojoin', 'language', 'model', 'notes_channel', 'provider', 'thread', 'whisper_model']);
});
