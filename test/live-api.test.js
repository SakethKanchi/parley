// test/live-api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import { apiRouter } from '../src/web/api.js';

// A fake bot controller exposing just the live surface the API uses.
function fakeBot(sessions = []) {
  return {
    client: null,
    _sessions: [...sessions],
    liveMeetings() { return this._sessions; },
    async stopMeeting(guildId, channelId) {
      const before = this._sessions.length;
      this._sessions = this._sessions.filter((s) => !(s.guildId === guildId && s.channelId === channelId));
      if (this._sessions.length === before) return { ok: false, error: 'No active recording in that channel.' };
      return { ok: true };
    },
  };
}

function appWith(db, bot) {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, bot }));
  return app;
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test('GET /guilds/:g/live returns the bot live sessions, scoped by guild', async () => {
  const db = openDb(':memory:');
  const m = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'standup', startedAt: 'now' });
  db.addAttendee(m, 'u1', 'Alice');
  const bot = fakeBot([
    { meetingId: m, guildId: 'g1', channelId: 'c1', channelName: 'standup', startedAt: '2026-06-30T10:00:00Z' },
    { meetingId: 99, guildId: 'g2', channelId: 'cz', channelName: 'other', startedAt: '2026-06-30T10:00:00Z' },
  ]);
  const { base, close } = await listen(appWith(db, bot));
  try {
    const { live } = await (await fetch(`${base}/api/guilds/g1/live`)).json();
    assert.equal(live.length, 1);
    assert.equal(live[0].channelName, 'standup');
    // Falls back to stored attendees when there's no live Discord client.
    assert.deepEqual(live[0].attendees.map((a) => a.displayName), ['Alice']);
  } finally { close(); }
});

test('POST /guilds/:g/live/:channelId/stop stops a recording', async () => {
  const db = openDb(':memory:');
  const bot = fakeBot([{ meetingId: 1, guildId: 'g1', channelId: 'c1', channelName: 'standup', startedAt: 'now' }]);
  const { base, close } = await listen(appWith(db, bot));
  try {
    const ok = await fetch(`${base}/api/guilds/g1/live/c1/stop`, { method: 'POST' });
    assert.equal(ok.status, 200);
    // Now it's gone from the live list.
    const { live } = await (await fetch(`${base}/api/guilds/g1/live`)).json();
    assert.equal(live.length, 0);
    // Stopping a channel with nothing live → 404.
    const missing = await fetch(`${base}/api/guilds/g1/live/c1/stop`, { method: 'POST' });
    assert.equal(missing.status, 404);
  } finally { close(); }
});

test('live endpoints degrade gracefully with no bot attached', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db, null));
  try {
    const { live } = await (await fetch(`${base}/api/guilds/g1/live`)).json();
    assert.deepEqual(live, []);
    const stop = await fetch(`${base}/api/guilds/g1/live/c1/stop`, { method: 'POST' });
    assert.equal(stop.status, 400); // not managed here
  } finally { close(); }
});
