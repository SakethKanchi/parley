// test/web-server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { startWebServer } from '../src/web/server.js';

// Log in as the seeded default admin and return the session cookie so we can
// hit the now-protected API in these end-to-end checks.
async function loginCookie(base) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('startWebServer binds 127.0.0.1 and serves api + backfills (authed)', async () => {
  const db = openDb(':memory:');
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.saveSummary(mId, { actionItems: [{ assignee: 'A', task: 'backfilled' }] }, [], 'test:m');
  const server = startWebServer({ db, client: null, port: 0 });
  await new Promise((r) => server.once('listening', r));
  const { address, port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal(address, '127.0.0.1');
    // Unauthenticated requests are rejected.
    const noauth = await fetch(`${base}/api/guilds/g1/todos`);
    assert.equal(noauth.status, 401);
    // After login the backfilled todo is visible.
    const cookie = await loginCookie(base);
    const todos = await (await fetch(`${base}/api/guilds/g1/todos`, { headers: { cookie } })).json();
    assert.equal(todos.length, 1); // backfill ran on start
    assert.equal(todos[0].task, 'backfilled');
  } finally { server.close(); }
});
