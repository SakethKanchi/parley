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

test('replaceUtterances atomically replaces transcript, completion state, and FTS rows', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  assert.equal(db.getMeeting(id).transcription_complete, null);
  db.addUtterance({ meetingId: id, userId: 'old', displayName: 'Old', startMs: 0, endMs: 1, text: 'obsolete rocket' });

  db.replaceUtterances(id, [
    { userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'new transcript' },
  ], { complete: true });

  assert.equal(db.getMeeting(id).transcription_complete, 1);
  assert.deepEqual(db.listUtterances(id).map((u) => u.text), ['new transcript']);
  assert.equal(db.searchUtterances('g', 'obsolete').length, 0);
  assert.equal(db.searchUtterances('g', 'transcript').length, 1);
});

test('replaceUtterances rolls back transcript and completion state when an insert fails', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.addUtterance({ meetingId: id, userId: 'old', displayName: 'Old', startMs: 0, endMs: 1, text: 'preserve me' });
  db.setTranscriptionComplete(id, true);
  db.sql.exec(`
    CREATE TRIGGER fail_replacement BEFORE INSERT ON utterances
    WHEN NEW.text = 'explode'
    BEGIN
      SELECT RAISE(ROLLBACK, 'forced replacement failure');
    END;
  `);

  assert.throws(() => db.replaceUtterances(id, [
    { userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'first' },
    { userId: 'u2', displayName: 'Bob', startMs: 1000, endMs: 2000, text: 'explode' },
  ], { complete: false }), /forced replacement failure/);

  assert.deepEqual(db.listUtterances(id).map((u) => u.text), ['preserve me']);
  assert.equal(db.getMeeting(id).transcription_complete, 1);
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

test('pipeline stage and delivery status are persisted', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  assert.equal(db.getMeeting(id).pipeline_stage, 'captured');
  db.setPipelineStage(id, 'delivering', 'missing permissions');
  db.setDeliveryStatus(id, false, 'missing permissions');
  const meeting = db.getMeeting(id);
  assert.equal(meeting.pipeline_stage, 'delivering');
  assert.equal(meeting.stage_error, 'missing permissions');
  assert.equal(meeting.delivered, 0);
  assert.equal(meeting.delivery_error, 'missing permissions');
});

test('findOrphanedMeetings returns recording/processing', () => {
  const db = freshDb();
  const a = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  const b = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'y', startedAt: 't' });
  db.setMeetingStatus(b, 'done', 't2');
  assert.deepEqual(db.findOrphanedMeetings().map((m) => m.id), [a]);
});

test('searchUtterances does not throw on FTS operator characters', () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.addUtterance({ meetingId: id, userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'ship the rocket today' });
  assert.doesNotThrow(() => db.searchUtterances('g', 'rocket OR ('));
  // a normal single-word query still finds the utterance (phrase of one token)
  assert.equal(db.searchUtterances('g', 'rocket').length, 1);
});

test('openDb creates hot-path indexes on utterances/todos/meetings', () => {
  const db = freshDb();
  const names = db.sql.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index'`
  ).all().map((r) => r.name);
  for (const idx of ['utterances_meeting', 'todos_meeting', 'todos_guild', 'meetings_guild']) {
    assert.ok(names.includes(idx), `expected index ${idx} to exist`);
  }
});

test('getSummary does not leak raw json columns', () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.saveSummary(id, { tldr: 'hi' }, [{ displayName: 'Alice', ms: 1, words: 1, pct: 100 }], 'm');
  const s = db.getSummary(id);
  assert.equal('notes_json' in s, false);
  assert.equal('talktime_json' in s, false);
  assert.equal(s.notes.tldr, 'hi');
});
