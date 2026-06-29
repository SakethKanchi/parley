import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';

function seed() {
  const db = openDb(':memory:');
  const g = 'g1';
  const m1 = db.createMeeting({ guildId: g, channelId: 'c', channelName: 'General', startedAt: '2026-06-29T10:00:00Z' });
  const m2 = db.createMeeting({ guildId: g, channelId: 'c', channelName: 'General', startedAt: '2026-06-29T10:01:00Z' });
  db.addAttendee(m1, 'u1', 'Alice');
  db.addAttendee(m2, 'u2', 'Bob');
  db.addUtterance({ meetingId: m1, userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1, text: 'hello world' });
  db.addUtterance({ meetingId: m2, userId: 'u2', displayName: 'Bob', startMs: 0, endMs: 1, text: 'goodbye moon' });
  db.saveSummary(m1, { tldr: 'x', actionItems: [{ assignee: 'Alice', task: 't1' }] }, [], 'm');
  db.saveSummary(m2, { tldr: 'y', actionItems: [{ assignee: 'Bob', task: 't2' }] }, [], 'm');
  db.seedTodos(m1, g, [{ assignee: 'Alice', task: 't1' }]);
  db.seedTodos(m2, g, [{ assignee: 'Bob', task: 't2' }]);
  return { db, g, m1, m2 };
}

test('listRecent reports utterance_count', () => {
  const { db, g } = seed();
  const rows = db.listRecent(g, 10);
  assert.equal(rows.every((r) => typeof r.utterance_count === 'number'), true);
  assert.equal(rows.find((r) => r.channel_name === 'General').utterance_count, 1);
});

test('deleteMeeting removes the meeting and all attached rows', () => {
  const { db, m1 } = seed();
  db.deleteMeeting(m1);
  assert.equal(db.getMeeting(m1), undefined);
  assert.equal(db.listUtterances(m1).length, 0);
  assert.equal(db.listAttendees(m1).length, 0);
  assert.equal(db.getSummary(m1), null);
  assert.equal(db.listTodos('g1').filter((t) => t.meeting_id === m1).length, 0);
});

test('deleteMeeting keeps FTS in sync (search no longer returns deleted rows)', () => {
  const { db, g, m1 } = seed();
  assert.equal(db.searchUtterances(g, 'hello').length, 1);
  db.deleteMeeting(m1);
  assert.equal(db.searchUtterances(g, 'hello').length, 0);
  // The other meeting's content is untouched.
  assert.equal(db.searchUtterances(g, 'goodbye').length, 1);
});

test('mergeMeetings moves utterances + attendees into target and drops sources', () => {
  const { db, g, m1, m2 } = seed();
  const merged = db.mergeMeetings(m1, [m2]);
  assert.deepEqual(merged, [m2]);
  assert.equal(db.getMeeting(m2), undefined);
  assert.equal(db.listUtterances(m1).length, 2);
  const names = db.listAttendees(m1).map((a) => a.display_name).sort();
  assert.deepEqual(names, ['Alice', 'Bob']);
  // Merged content is searchable under the surviving meeting.
  assert.equal(db.searchUtterances(g, 'goodbye').length, 1);
});

test('mergeMeetings ignores the target id and empty source lists', () => {
  const { db, m1 } = seed();
  assert.deepEqual(db.mergeMeetings(m1, [m1]), []);
  assert.deepEqual(db.mergeMeetings(m1, []), []);
  assert.equal(db.listUtterances(m1).length, 1);
});

test('clearSummary drops summary + auto-seeded todos for re-summarize', () => {
  const { db, m1 } = seed();
  db.clearSummary(m1);
  assert.equal(db.getSummary(m1), null);
  assert.equal(db.listTodos('g1').filter((t) => t.meeting_id === m1).length, 0);
});
