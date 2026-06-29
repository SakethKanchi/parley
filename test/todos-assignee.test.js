import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';

test('listTodos filters by assignee, including null/Unassigned', () => {
  const db = openDb(':memory:');
  const m = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.seedTodos(m, 'g1', [{ assignee: 'Alice', task: 'a' }, { assignee: 'Bob', task: 'b' }, { assignee: null, task: 'c' }]);
  assert.equal(db.listTodos('g1', { assignee: 'Alice' }).length, 1);
  assert.equal(db.listTodos('g1', { assignee: null }).length, 1);   // unassigned
  assert.equal(db.listTodos('g1').length, 3);                       // no filter unchanged
  assert.equal(db.listTodos('g1', { open: true }).length, 3);       // open-only unchanged
});

test('listAssignees returns distinct assignees incl. null', () => {
  const db = openDb(':memory:');
  const m = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.seedTodos(m, 'g1', [{ assignee: 'Bob', task: 'b' }, { assignee: 'Alice', task: 'a' }, { assignee: 'Alice', task: 'a2' }, { assignee: null, task: 'c' }]);
  const names = db.listAssignees('g1').map((r) => r.assignee);
  assert.deepEqual(names, [null, 'Alice', 'Bob']); // null first, then alpha
});
