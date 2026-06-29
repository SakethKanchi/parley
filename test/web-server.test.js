// test/web-server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { startWebServer } from '../src/web/server.js';

test('startWebServer binds 127.0.0.1 and serves api + backfills', async () => {
  const db = openDb(':memory:');
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.saveSummary(mId, { actionItems: [{ assignee: 'A', task: 'backfilled' }] }, [], 'test:m');
  const server = startWebServer({ db, client: null, port: 0 });
  await new Promise((r) => server.once('listening', r));
  const { address, port } = server.address();
  try {
    assert.equal(address, '127.0.0.1');
    const todos = await (await fetch(`http://127.0.0.1:${port}/api/guilds/g1/todos`)).json();
    assert.equal(todos.length, 1); // backfill ran on start
    assert.equal(todos[0].task, 'backfilled');
  } finally { server.close(); }
});
