// test/db-aggregates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';

function seed() {
  const db = openDb(':memory:');
  const m1 = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'general', startedAt: new Date().toISOString() });
  db.setMeetingStatus(m1, 'done', new Date().toISOString());
  db.addAttendee(m1, 'u1', 'Alice');
  db.addAttendee(m1, 'u2', 'Bob');
  db.addUtterance({ meetingId: m1, userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello world' });
  db.addUtterance({ meetingId: m1, userId: 'u2', displayName: 'Bob', startMs: 1000, endMs: 2000, text: 'hi there' });
  db.saveSummary(m1, {
    tldr: 'A short chat.',
    topics: [{ title: 'T', points: ['p'] }],
    decisions: ['ship it'],
    actionItems: [{ assignee: 'Alice', task: 'do x' }, { assignee: 'Bob', task: 'do y' }],
  }, [
    { displayName: 'Alice', ms: 6000, words: 100, pct: 60 },
    { displayName: 'Bob', ms: 4000, words: 60, pct: 40 },
  ], 'test:m');
  db.seedTodos(m1, 'g', [{ assignee: 'Alice', task: 'do x' }, { assignee: 'Bob', task: 'do y' }]);

  const m2 = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'eng', startedAt: new Date().toISOString() });
  db.setMeetingStatus(m2, 'done', new Date().toISOString());
  db.addAttendee(m2, 'u1', 'Alice');
  db.saveSummary(m2, { tldr: 'Solo.', topics: [], decisions: [] }, [
    { displayName: 'Alice', ms: 2000, words: 30, pct: 100 },
  ], 'test:m');
  return db;
}

test('listRecentRich enriches rows with counts + preview', () => {
  const db = seed();
  const rows = db.listRecentRich('g', 50);
  assert.equal(rows.length, 2);
  const m1 = rows.find((r) => r.channel_name === 'general');
  assert.equal(m1.utterance_count, 2);
  assert.equal(m1.attendee_count, 2);
  assert.equal(m1.action_count, 2);
  assert.equal(m1.open_action_count, 2);
  assert.equal(m1.tldr, 'A short chat.');
  assert.equal(m1.topic_count, 1);
  assert.equal(m1.decision_count, 1);
  assert.deepEqual(m1.attendee_names, ['Alice', 'Bob']);
  assert.equal(m1.has_summary, true);
  assert.equal(m1.talktime.length, 2);
});

test('guildStats rolls up headline numbers', () => {
  const db = seed();
  const s = db.guildStats('g');
  assert.equal(s.totalMeetings, 2);
  assert.equal(s.doneMeetings, 2);
  assert.equal(s.totalUtterances, 2);
  assert.equal(s.people, 2); // distinct user_ids: u1, u2
  assert.equal(s.totalTalkMs, 6000 + 4000 + 2000);
  assert.equal(s.todos.total, 2);
  assert.equal(s.todos.open, 2);
  assert.equal(s.todos.done, 0);
});

test('talkTimeLeaderboard aggregates per person desc', () => {
  const db = seed();
  const lb = db.talkTimeLeaderboard('g');
  assert.equal(lb[0].displayName, 'Alice'); // 6000 + 2000 = 8000 ms
  assert.equal(lb[0].ms, 8000);
  assert.equal(lb[0].meetings, 2);
  assert.equal(lb[1].displayName, 'Bob');
  assert.equal(lb[1].ms, 4000);
});

test('meetingsTimeline returns a padded day series ending today', () => {
  const db = seed();
  const tl = db.meetingsTimeline('g', 7);
  assert.equal(tl.length, 7);
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  assert.equal(tl[tl.length - 1].date, todayKey);
  assert.equal(tl[tl.length - 1].count, 2); // both meetings seeded "now"
});
