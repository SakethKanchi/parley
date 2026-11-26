// test/retry.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { retryPlan, retryMeeting, RETRYABLE_STATUSES } from '../src/pipeline/retry.js';
import { apiRouter } from '../src/web/api.js';

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'parley-retry-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('retryPlan: re-summarize when utterances exist', () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'hi' });
  db.setMeetingStatus(id, 'summary_failed');
  const plan = retryPlan(db, id, { dataDir: '/nonexistent' });
  assert.equal(plan.ok, true);
  assert.equal(plan.action, 'resummarize');
});

test('retryPlan: re-summarizes a known-complete transcript even when PCM remains', () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'hi' });
    db.setTranscriptionComplete(id, true);
    db.setMeetingStatus(id, 'summary_failed');
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u_0.pcm'), 'x');

    assert.equal(retryPlan(db, id, { dataDir: dir }).action, 'resummarize');
  } finally { cleanup(); }
});

test('retryPlan: summary failure with partial transcript retries summarization only', () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'partial' });
    db.setTranscriptionComplete(id, false);
    db.setMeetingStatus(id, 'summary_failed');
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u_0.pcm'), 'x');

    assert.equal(retryPlan(db, id, { dataDir: dir }).action, 'resummarize');
  } finally { cleanup(); }
});

test('retryPlan: legacy summary failure with saved transcript avoids retranscription', () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'possibly partial' });
    db.setMeetingStatus(id, 'summary_failed');
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u_0.pcm'), 'x');

    assert.equal(db.getMeeting(id).transcription_complete, null);
    assert.equal(retryPlan(db, id, { dataDir: dir }).action, 'resummarize');
  } finally { cleanup(); }
});

test('retryPlan: retranscribe when PCM exists but no utterances', () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.setMeetingStatus(id, 'transcription_failed');
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u1_0.pcm'), 'x');
    const plan = retryPlan(db, id, { dataDir: dir });
    assert.equal(plan.ok, true);
    assert.equal(plan.action, 'retranscribe');
  } finally { cleanup(); }
});

test('retryPlan: forced retranscription prefers retained audio over a saved transcript', () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'old transcript' });
    db.setMeetingStatus(id, 'summary_failed');
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u_0.pcm'), 'x');

    assert.equal(retryPlan(db, id, { dataDir: dir }).action, 'resummarize');
    const plan = retryPlan(db, id, { dataDir: dir, forceTranscribe: true });
    assert.equal(plan.ok, true);
    assert.equal(plan.action, 'retranscribe');
  } finally { cleanup(); }
});

test('retryPlan: completed meetings are not retryable', () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.setMeetingStatus(id, 'done');
  const plan = retryPlan(db, id, { dataDir: '/nonexistent' });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /already complete/i);
});

test('retryPlan: unrecoverable when no utterances and no audio', () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.setMeetingStatus(id, 'transcription_failed');
    const plan = retryPlan(db, id, { dataDir: dir });
    assert.equal(plan.ok, false);
    assert.equal(plan.action, 'none');
    assert.match(plan.reason, /cannot be retried/i);
  } finally { cleanup(); }
});

test('retryMeeting: re-summarizes a summary_failed meeting via the fake provider', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'ship on friday' });
  db.setMeetingStatus(id, 'summary_failed');
  // Force the fake summarizer (no network / key needed).
  db.sql.prepare(`INSERT INTO guild_config (guild_id, summarizer_provider) VALUES ('g1', 'fake')`).run();

  const result = await retryMeeting(db, id, { dataDir: '/nonexistent' });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'resummarize');
  assert.equal(result.status, 'done');
  assert.equal(db.getMeeting(id).status, 'done');
  assert.ok(db.getSummary(id), 'summary should now exist');
});

test('retryMeeting: forced retranscription replaces the transcript and generated todos', async () => {
  const { dir, cleanup } = tmp();
  try {
    const db = openDb(':memory:');
    const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
    db.addAttendee(id, 'u', 'Al');
    db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'old transcript' });
    db.setMeetingStatus(id, 'summary_failed');
    db.setTranscriptionComplete(id, false);
    db.saveSummary(id, { actionItems: [] }, [], 'fake');
    db.seedTodos(id, 'g1', [{ assignee: 'Al', task: 'stale action item' }]);
    db.sql.prepare(`INSERT INTO guild_config (guild_id, summarizer_provider) VALUES ('g1', 'fake')`).run();
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u_0.pcm'), 'x');

    let delivered = false;
    const result = await retryMeeting(db, id, {
      dataDir: dir,
      forceTranscribe: true,
      transcribe: async (tracks) => {
        assert.equal(tracks.length, 1);
        return [{ userId: 'u', displayName: 'Al', startMs: 0, endMs: 10, text: 'corrected transcript' }];
      },
      deliver: async () => { delivered = true; },
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, 'retranscribe');
    assert.equal(delivered, true);
    assert.equal(db.getMeeting(id).status, 'done');
    assert.deepEqual(db.listUtterances(id).map((u) => u.text), ['corrected transcript']);
    assert.ok(!db.listTodos('g1').some((todo) => todo.task === 'stale action item'));
  } finally { cleanup(); }
});

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test('GET /api/guilds/:g/meetings marks only failed meetings with retained audio', async () => {
  const { dir, cleanup } = tmp();
  const db = openDb(':memory:');
  const retryableId = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.setMeetingStatus(retryableId, 'transcription_failed');
  const completedId = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.setMeetingStatus(completedId, 'done');
  for (const id of [retryableId, completedId]) {
    const audioDir = join(dir, 'audio', String(id));
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, 'u_0.pcm'), 'x');
  }

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, client: null, dataDir: dir }));
  const { base, close } = await listen(app);
  try {
    const rows = await (await fetch(`${base}/api/guilds/g1/meetings`)).json();
    const byId = new Map(rows.map((meeting) => [meeting.id, meeting]));
    assert.equal(byId.get(retryableId).can_retranscribe, true);
    assert.equal(byId.get(completedId).can_retranscribe, false);
  } finally {
    close();
    cleanup();
  }
});

test('POST /api/meetings/:id/retry re-summarizes and returns done', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'ship on friday' });
  db.setMeetingStatus(id, 'summary_failed');
  db.sql.prepare(`INSERT INTO guild_config (guild_id, summarizer_provider) VALUES ('g1', 'fake')`).run();

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, client: null }));
  const { base, close } = await listen(app);
  try {
    // detail bundle advertises retry eligibility
    const bundle = await (await fetch(`${base}/api/meetings/${id}`)).json();
    assert.equal(bundle.retry.eligible, true);
    assert.equal(bundle.retry.action, 'resummarize');

    const r = await fetch(`${base}/api/meetings/${id}/retry`, { method: 'POST' });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, 'done');
    assert.equal(body.meeting.status, 'done');
  } finally { close(); }
});

test('GET /api/commands returns the command catalog', async () => {
  const db = openDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, client: null }));
  const { base, close } = await listen(app);
  try {
    const { commands } = await (await fetch(`${base}/api/commands`)).json();
    assert.ok(Array.isArray(commands) && commands.length > 0);
    const names = commands.map((c) => c.name);
    for (const n of ['join', 'leave', 'summary', 'setup']) assert.ok(names.includes(n), `missing ${n}`);
    assert.equal(commands.find((c) => c.name === 'setup').admin, true);
  } finally { close(); }
});

test('RETRYABLE_STATUSES covers the failure states', () => {
  assert.ok(RETRYABLE_STATUSES.has('transcription_failed'));
  assert.ok(RETRYABLE_STATUSES.has('summary_failed'));
  assert.ok(!RETRYABLE_STATUSES.has('done'));
});
