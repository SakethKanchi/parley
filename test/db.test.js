import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';

function freshDb() { return openDb(':memory:'); }

test('createMeeting + getMeeting roundtrip', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'general', startedAt: '2026-06-04T10:00:00Z' });
  const m = db.getMeeting(id);
  assert.equal(m.guild_id, 'g');
  assert.equal(m.status, 'recording');
});

test('addAttendee + listAttendees', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.addAttendee(id, 'u1', 'Alice');
  db.addAttendee(id, 'u1', 'Alice'); // idempotent
  assert.deepEqual(db.listAttendees(id).map((a) => a.display_name), ['Alice']);
});

test('addUtterance + search via FTS', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.addUtterance({ meetingId: id, userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'ship the rocket today' });
  const hits = db.searchUtterances('g', 'rocket');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].meeting_id, id);
});

test('saveSummary + getSummary', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.saveSummary(id, { tldr: 'hi' }, [{ displayName: 'Alice', ms: 1000, words: 4, pct: 100 }], 'gemini:flash');
  const s = db.getSummary(id);
  assert.equal(s.notes.tldr, 'hi');
  assert.equal(s.talktime[0].displayName, 'Alice');
});

test('setMeetingStatus + listRecent', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: '2026-06-04T10:00:00Z' });
  db.setMeetingStatus(id, 'done', '2026-06-04T11:00:00Z');
  const recent = db.listRecent('g', 10);
  assert.equal(recent[0].status, 'done');
});

test('findOrphanedMeetings returns recording/processing', () => {
  const db = freshDb();
  const a = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  const b = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'y', startedAt: 't' });
  db.setMeetingStatus(b, 'done', 't2');
  assert.deepEqual(db.findOrphanedMeetings().map((m) => m.id), [a]);
});
