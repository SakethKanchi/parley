import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MeetingManager } from '../src/voice/meeting-manager.js';

function makeManager() {
  const db = openDb(':memory:');
  const started = [];
  const mgr = new MeetingManager({
    db,
    audioRoot: '/tmp/audio',
    startCapture: (ctx) => { started.push(ctx.meetingId); return { registry: { list: () => [] } }; },
    finalize: async () => {},
    now: () => '2026-06-04T10:00:00Z',
  });
  return { db, mgr, started };
}

test('start creates a meeting row, records attendees, tracks active key', () => {
  const { db, mgr } = makeManager();
  const id = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'general', connection: {}, guild: {}, attendees: [{ id: 'u1', displayName: 'Alice' }] });
  assert.equal(db.getMeeting(id).status, 'recording');
  assert.deepEqual(db.listAttendees(id).map((a) => a.display_name), ['Alice']);
  assert.equal(mgr.isActive('g', 'c'), true);
});

test('start is idempotent per guild+channel', () => {
  const { mgr } = makeManager();
  const a = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  const b = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  assert.equal(a, b);
});

test('two channels record concurrently', () => {
  const { mgr } = makeManager();
  mgr.start({ guildId: 'g', channelId: 'c1', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  mgr.start({ guildId: 'g', channelId: 'c2', channelName: 'y', connection: {}, guild: {}, attendees: [] });
  assert.equal(mgr.isActive('g', 'c1'), true);
  assert.equal(mgr.isActive('g', 'c2'), true);
});

test('stop finalizes and clears the active key', async () => {
  const { db, mgr } = makeManager();
  const id = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  await mgr.stop('g', 'c');
  assert.equal(mgr.isActive('g', 'c'), false);
  assert.ok(db.getMeeting(id));
});

test('stop() twice finalizes once and is a no-op the second time', async () => {
  const db = openDb(':memory:');
  let finalizeCalls = 0;
  const mgr = new MeetingManager({
    db,
    audioRoot: '/tmp/audio',
    startCapture: () => ({ registry: { list: () => [] } }),
    finalize: async () => { finalizeCalls += 1; },
    now: () => '2026-06-04T10:00:00Z',
  });
  mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  const first = await mgr.stop('g', 'c');
  const second = await mgr.stop('g', 'c');
  assert.ok(first);                 // first stop returns the meetingId
  assert.equal(second, null);       // second stop is a no-op
  assert.equal(finalizeCalls, 1);   // finalize fired exactly once
  assert.equal(mgr.isActive('g', 'c'), false);
});

test('stop flushes via stopAll before harvesting tracks and finalizing', async () => {
  const db = openDb(':memory:');
  const order = [];
  const mgr = new MeetingManager({
    db,
    audioRoot: '/tmp/audio',
    startCapture: () => ({
      registry: { list: () => { order.push('list'); return []; } },
      stopAll: async () => { order.push('stopAll'); },
    }),
    finalize: async () => { order.push('finalize'); },
    now: () => '2026-06-04T10:00:00Z',
  });
  mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  await mgr.stop('g', 'c');
  assert.deepEqual(order, ['stopAll', 'list', 'finalize']);
});
