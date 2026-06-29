// test/todos.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';

function freshDb() { return openDb(':memory:'); }

test('seedTodos inserts action items and dedups on re-seed', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'general', startedAt: 'now' });
  const items = [{ assignee: 'Alice', task: 'ship it' }, { assignee: null, task: 'pick a name' }];
  assert.equal(db.seedTodos(mId, 'g1', items), 2);
  assert.equal(db.seedTodos(mId, 'g1', items), 0); // UNIQUE dedup
  const todos = db.listTodos('g1');
  assert.equal(todos.length, 2);
  assert.equal(todos.every((t) => t.done === 0), true);
});

test('listTodos open filter and setTodoDone toggle', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'g', startedAt: 'now' });
  db.seedTodos(mId, 'g1', [{ assignee: 'Bob', task: 'A' }, { assignee: 'Bob', task: 'B' }]);
  const [first] = db.listTodos('g1');
  db.setTodoDone(first.id, 1);
  assert.equal(db.listTodos('g1', { open: true }).length, 1);
  assert.equal(db.listTodos('g1').length, 2);
});

test('listGuilds returns distinct guilds from meetings and config', () => {
  const db = freshDb();
  db.createMeeting({ guildId: 'gA', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.createMeeting({ guildId: 'gA', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.sql.prepare(`INSERT INTO guild_config (guild_id) VALUES ('gB')`).run();
  const ids = db.listGuilds().map((r) => r.guild_id).sort();
  assert.deepEqual(ids, ['gA', 'gB']);
});

test('backfillTodos is idempotent', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.saveSummary(mId, { actionItems: [{ assignee: 'Al', task: 'x' }] }, [], 'test:model');
  assert.equal(db.backfillTodos(), 1);
  assert.equal(db.backfillTodos(), 0);
  assert.equal(db.listTodos('g1').length, 1);
});
