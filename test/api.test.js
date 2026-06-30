// test/api.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ChannelType } from 'discord.js';
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

test('GET config returns providers + PATCH validates', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db));
  try {
    const cfg = await (await fetch(`${base}/api/guilds/g1/config`)).json();
    assert.ok(Array.isArray(cfg.providers));
    assert.equal(cfg.config.summarizerProvider, 'gemini'); // default

    // invalid provider rejected with 400
    const bad = await fetch(`${base}/api/guilds/g1/config`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'not-a-provider' }),
    });
    assert.equal(bad.status, 400);

    // valid no-key-required change (whisper model) accepted
    const ok = await fetch(`${base}/api/guilds/g1/config`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whisperModel: 'base' }),
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).config.whisperModel, 'base');
  } finally { close(); }
});

test('GET /api/guilds merges live client cache with db guilds (no duplicates)', async () => {
  const db = openDb(':memory:');
  // g1 is in db (from a meeting), g2 is only in the bot's guild cache
  db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });

  const stubCache = new Map([
    ['g1', { id: 'g1', name: 'Guild One' }],
    ['g2', { id: 'g2', name: 'Fresh Guild' }],
  ]);
  const stubClient = { guilds: { cache: stubCache } };

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, client: stubClient }));
  const { base, close } = await listen(app);
  try {
    const guilds = await (await fetch(`${base}/api/guilds`)).json();
    // Both guilds present, no duplicate for g1
    assert.equal(guilds.length, 2);
    const ids = guilds.map((g) => g.id).sort();
    assert.deepEqual(ids, ['g1', 'g2']);
    // Name is resolved via the cache when available
    const g2 = guilds.find((g) => g.id === 'g2');
    assert.equal(g2.name, 'Fresh Guild');
  } finally { close(); }
});

test('todos assignee filter + assignees endpoint', async () => {
  const db = openDb(':memory:');
  const m = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.seedTodos(m, 'g1', [{ assignee: 'Alice', task: 'a' }, { assignee: null, task: 'c' }]);
  const { base, close } = await listen(appWith(db));
  try {
    const all = await (await fetch(`${base}/api/guilds/g1/todos`)).json();
    assert.equal(all.length, 2);
    const alice = await (await fetch(`${base}/api/guilds/g1/todos?assignee=Alice`)).json();
    assert.equal(alice.length, 1);
    const un = await (await fetch(`${base}/api/guilds/g1/todos?assignee=__unassigned__`)).json();
    assert.equal(un.length, 1);
    const names = (await (await fetch(`${base}/api/guilds/g1/assignees`)).json()).map((r) => r.assignee);
    assert.deepEqual(names, [null, 'Alice']);
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

test('POST ask returns an answer using the guild provider', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  db.addUtterance({ meetingId: id, userId: 'u', displayName: 'Al', startMs: 0, endMs: 5, text: 'ship friday' });
  db.sql.prepare(`INSERT INTO guild_config (guild_id, summarizer_provider) VALUES ('g1', 'fake')`).run();
  const { base, close } = await listen(appWith(db));
  try {
    const r = await fetch(`${base}/api/guilds/g1/meetings/${id}/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'when do we ship?' }),
    });
    assert.equal(r.status, 200);
    assert.equal(typeof (await r.json()).answer, 'string');
    const bad = await fetch(`${base}/api/guilds/g1/meetings/${id}/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: '' }),
    });
    assert.equal(bad.status, 400);
  } finally { close(); }
});

test('GET /api/system/status reports bot + connection (managed)', async () => {
  const db = openDb(':memory:');
  // Fake controller standing in for BotController.
  const fakeBot = {
    client: { user: { tag: 'Parley#1', id: 'b1' }, guilds: { cache: new Map([['g', {}]]) } },
    status() {
      return { state: 'ready', connected: true, hasCreds: true,
        user: { tag: 'Parley#1', id: 'b1' }, guildCount: 1, error: null };
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, bot: fakeBot }));
  const { base, close } = await listen(app);
  try {
    const s = await (await fetch(`${base}/api/system/status`)).json();
    assert.equal(s.managed, true);
    assert.equal(s.bot.connected, true);
    assert.equal(s.bot.user.tag, 'Parley#1');
    // The token presence is reported, never the value.
    assert.ok('connection' in s);
    assert.equal('value' in (s.connection.discordToken || {}), false);
  } finally { close(); }
});

test('PUT /api/system/connection requires a recognized field', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db));
  try {
    const bad = await fetch(`${base}/api/system/connection`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: 'x' }),
    });
    assert.equal(bad.status, 400);
  } finally { close(); }
});

test('POST /api/system/bot/:action is rejected when unmanaged', async () => {
  const db = openDb(':memory:');
  const { base, close } = await listen(appWith(db));
  try {
    const r = await fetch(`${base}/api/system/bot/start`, { method: 'POST' });
    assert.equal(r.status, 400);
  } finally { close(); }
});
