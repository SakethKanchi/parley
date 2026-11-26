import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { processMeeting } from '../src/pipeline/orchestrator.js';
import { FakeSummarizer } from '../src/adapters/summarizer/fake.js';

function seed() {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'general', startedAt: 't' });
  db.addAttendee(id, 'u1', 'Alice');
  return { db, id };
}

const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' }];

test('processMeeting transcribes, summarizes, stores, sets done, delivers', async () => {
  const { db, id } = seed();
  let delivered = null;
  await processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake', whisperModel: 'small', language: 'auto' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({ utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello team' }], failures: [] }),
    deliver: async (notes, talktime) => { delivered = { notes, talktime }; },
  });
  assert.equal(db.getMeeting(id).status, 'done');
  assert.equal(db.getMeeting(id).transcription_complete, 1);
  assert.equal(db.listUtterances(id).length, 1);
  assert.ok(db.getSummary(id));
  assert.ok(delivered.notes.tldr);
  assert.equal(delivered.talktime[0].displayName, 'Alice');
});

test('processMeeting marks transcription_failed and rethrows on STT error', async () => {
  const { db, id } = seed();
  await assert.rejects(processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => { throw new Error('sidecar down'); },
    deliver: async () => {},
  }), /sidecar down/);
  assert.equal(db.getMeeting(id).status, 'transcription_failed');
  assert.equal(db.getMeeting(id).transcription_complete, 0);
});

test('processMeeting keeps a meeting alive when only some tracks fail transcription', async () => {
  const { db, id } = seed();
  const { notes, talktime } = await processMeeting(db, id, {
    tracks: [
      { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
      { userId: 'u2', displayName: 'Bob', startMs: 1000, pcmPath: '/b.pcm' },
    ],
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({
      utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello team' }],
      failures: [{ userId: 'u2', displayName: 'Bob', error: 'corrupt pcm' }],
    }),
    deliver: async () => {},
  });
  assert.equal(db.getMeeting(id).status, 'done');
  assert.equal(db.getMeeting(id).transcription_complete, 0);
  assert.equal(db.listUtterances(id).length, 1);
  assert.ok(notes.tldr);
  assert.equal(talktime[0].displayName, 'Alice');
});

test('processMeeting marks transcription_failed when every track fails (no partial results)', async () => {
  const { db, id } = seed();
  await assert.rejects(processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({ utterances: [], failures: [{ userId: 'u1', displayName: 'Alice', error: 'sidecar down' }] }),
    deliver: async () => {},
  }), /All 1 track\(s\) failed transcription/);
  assert.equal(db.getMeeting(id).status, 'transcription_failed');
  assert.equal(db.getMeeting(id).transcription_complete, 0);
  assert.equal(db.listUtterances(id).length, 0);
});

test('processMeeting rolls back transcript replacement and fails safely when persistence throws', async () => {
  const { db, id } = seed();
  db.addUtterance({ meetingId: id, userId: 'old', displayName: 'Old', startMs: 0, endMs: 1, text: 'preserve me' });
  db.setTranscriptionComplete(id, true);
  db.sql.exec(`
    CREATE TRIGGER fail_pipeline_replacement BEFORE INSERT ON utterances
    WHEN NEW.text = 'explode'
    BEGIN
      SELECT RAISE(ABORT, 'forced replacement failure');
    END;
  `);

  await assert.rejects(processMeeting(db, id, {
    tracks: [
      { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
      { userId: 'u2', displayName: 'Bob', startMs: 1000, pcmPath: '/b.pcm' },
    ],
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({
      utterances: [
        { userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'first' },
        { userId: 'u2', displayName: 'Bob', startMs: 1000, endMs: 2000, text: 'explode' },
      ],
      failures: [],
    }),
    deliver: async () => {},
  }), /forced replacement failure/);

  assert.equal(db.getMeeting(id).status, 'transcription_failed');
  assert.deepEqual(db.listUtterances(id).map((u) => u.text), ['preserve me']);
  assert.equal(db.getMeeting(id).transcription_complete, 1);
});

test('processMeeting replaces an existing partial transcript instead of appending duplicates', async () => {
  const { db, id } = seed();
  db.addUtterance({ meetingId: id, userId: 'old', displayName: 'Old', startMs: 0, endMs: 1, text: 'old partial' });
  db.setTranscriptionComplete(id, false);

  await processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({
      utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'replacement' }],
      failures: [],
    }),
    deliver: async () => {},
  });

  assert.deepEqual(db.listUtterances(id).map((u) => u.text), ['replacement']);
  assert.equal(db.getMeeting(id).transcription_complete, 1);
});

test('processMeeting marks summary_failed when summarizer throws', async () => {
  const { db, id } = seed();
  const boom = { summarize: async () => { throw new Error('429'); } };
  await assert.rejects(processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: boom,
    transcribe: async () => ({ utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hi' }], failures: [] }),
    deliver: async () => {},
  }), /429/);
  assert.equal(db.getMeeting(id).status, 'summary_failed');
  assert.equal(db.listUtterances(id).length, 1); // transcript still saved
});

test('processMeeting measures and stores per-stage timings on the summary row', async () => {
  const { db, id } = seed();
  await processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello team' }], failures: [] };
    },
    deliver: async () => {},
  });
  const summary = db.getSummary(id);
  assert.ok(summary.timings);
  assert.equal(typeof summary.timings.transcribeMs, 'number');
  assert.equal(typeof summary.timings.summarizeMs, 'number');
  assert.ok(summary.timings.transcribeMs >= 0);
  assert.ok(summary.timings.summarizeMs >= 0);
  assert.equal(summary.timings.tracks, 1);
});

test('processMeeting keeps a meeting done when delivery fails (notes still saved)', async () => {
  const { db, id } = seed();
  const { delivered, deliveryError } = await processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({ utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello team' }], failures: [] }),
    deliver: async () => { throw new Error('missing permissions'); },
  });
  // Delivery threw, but the meeting is done and the summary is persisted.
  assert.equal(db.getMeeting(id).status, 'done');
  assert.ok(db.getSummary(id));
  assert.equal(delivered, false);
  assert.match(deliveryError, /missing permissions/);
  const meeting = db.getMeeting(id);
  assert.equal(meeting.pipeline_stage, 'delivering');
  assert.equal(meeting.delivered, 0);
  assert.match(meeting.delivery_error, /missing permissions/);
});

test('processMeeting reports delivered:true on a successful post', async () => {
  const { db, id } = seed();
  const { delivered, deliveryError } = await processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => ({ utterances: [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hi' }], failures: [] }),
    deliver: async () => {},
  });
  assert.equal(delivered, true);
  assert.equal(deliveryError, null);
  const meeting = db.getMeeting(id);
  assert.equal(meeting.pipeline_stage, 'completed');
  assert.equal(meeting.delivered, 1);
  assert.equal(meeting.delivery_error, null);
});
