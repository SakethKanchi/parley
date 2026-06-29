// test/api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import { apiRouter } from '../src/web/api.js';

function appWith(db) {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, client: null }));
  return app;
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test('GET /api/guilds and meetings and todos', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.seedTodos(id, 'g1', [{ assignee: 'Al', task: 'x' }]);
  const { base, close } = await listen(appWith(db));
  try {
    const guilds = await (await fetch(`${base}/api/guilds`)).json();
    assert.deepEqual(guilds, [{ id: 'g1', name: 'g1' }]);
    const meetings = await (await fetch(`${base}/api/guilds/g1/meetings`)).json();
    assert.equal(meetings.length, 1);
    const todos = await (await fetch(`${base}/api/guilds/g1/todos`)).json();
    assert.equal(todos.length, 1);
    const patch = await fetch(`${base}/api/todos/${todos[0].id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: true }),
    });
    assert.equal(patch.status, 200);
    assert.equal((await (await fetch(`${base}/api/guilds/g1/todos?open=1`)).json()).length, 0);
  } finally { close(); }
});

test('GET /api/meetings/:id returns bundle', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'hello' });
  db.saveSummary(id, { tldr: 'hi', actionItems: [] }, [], 'test:m');
  const { base, close } = await listen(appWith(db));
  try {
    const bundle = await (await fetch(`${base}/api/meetings/${id}`)).json();
    assert.equal(bundle.meeting.id, id);
    assert.equal(bundle.summary.notes.tldr, 'hi');
    assert.equal(bundle.utterances.length, 1);
  } finally { close(); }
});
