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
    transcribe: async () => [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello team' }],
    deliver: async (notes, talktime) => { delivered = { notes, talktime }; },
  });
  assert.equal(db.getMeeting(id).status, 'done');
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
});

test('processMeeting marks summary_failed when summarizer throws', async () => {
  const { db, id } = seed();
  const boom = { summarize: async () => { throw new Error('429'); } };
  await assert.rejects(processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: boom,
    transcribe: async () => [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hi' }],
    deliver: async () => {},
  }), /429/);
  assert.equal(db.getMeeting(id).status, 'summary_failed');
  assert.equal(db.listUtterances(id).length, 1); // transcript still saved
});
