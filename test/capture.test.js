import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackRegistry } from '../src/voice/capture.js';

test('TrackRegistry records and lists finished tracks', () => {
  const reg = new TrackRegistry();
  reg.begin('u1', 'Alice', 1000, '/audio/1/u1_1000.pcm');
  reg.begin('u2', 'Bob', 1500, '/audio/1/u2_1500.pcm');
  reg.finish('u1');
  reg.finish('u2');
  const tracks = reg.list();
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((t) => t.displayName).sort(), ['Alice', 'Bob']);
  assert.equal(tracks[0].pcmPath.endsWith('.pcm'), true);
});

test('TrackRegistry isActive prevents duplicate begin', () => {
  const reg = new TrackRegistry();
  reg.begin('u1', 'Alice', 1000, '/p.pcm');
  assert.equal(reg.isActive('u1'), true);
  assert.equal(reg.isActive('u2'), false);
});

// ── attachCapture wiring: listener detach + onSpeaker (needs fakes) ────────────
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachCapture, SPEAKER_SILENCE_MS } from '../src/voice/capture.js';

// Minimal stand-ins for the discord.js voice receiver + guild so we can drive
// speaking-start events deterministically without a live connection. subscribe
// returns a stream that emits 'end' on the next tick so tracks finish cleanly.
function fakeConnection() {
  const speaking = new EventEmitter();
  return {
    receiver: {
      speaking,
      subscribe(_userId, options) {
        this.lastOptions = options;
        const s = new EventEmitter();
        s.pipe = () => s;            // opusStream.pipe(decoder).pipe(out)
        s.destroy = () => {};
        setImmediate(() => s.emit('end'));
        return s;
      },
    },
  };
}
function fakeGuild(members) {
  return { members: { cache: { get: (id) => members[id] } } };
}

test('capture uses a 3-second silence threshold to reduce tiny speech tracks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap-silence-'));
  try {
    const connection = fakeConnection();
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const registry = new TrackRegistry();
    const { stopAll } = attachCapture({ connection, guild, audioDir: dir, registry });
    connection.receiver.speaking.emit('start', 'u1');
    assert.equal(SPEAKER_SILENCE_MS, 3000);
    assert.equal(connection.receiver.lastOptions.end.duration, SPEAKER_SILENCE_MS);
    await stopAll();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stopAll detaches the speaking listener so post-stop speech is ignored', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap-'));
  try {
    const connection = fakeConnection();
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const { TrackRegistry } = await import('../src/voice/capture.js');
    const registry = new TrackRegistry();
    const { stopAll } = attachCapture({ connection, guild, audioDir: dir, registry });

    await stopAll();
    // A speaking-start AFTER stopAll must not open a new (untracked) stream.
    connection.receiver.speaking.emit('start', 'u1');
    await new Promise((r) => setImmediate(r));
    assert.equal(registry.isActive('u1'), false);
    assert.equal(registry.list().length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('onSpeaker fires for a member who first speaks (latecomer attendee capture)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap2-'));
  try {
    const connection = fakeConnection();
    const guild = fakeGuild({ u9: { displayName: 'Latecomer', user: { bot: false } } });
    const { TrackRegistry } = await import('../src/voice/capture.js');
    const registry = new TrackRegistry();
    const seen = [];
    attachCapture({ connection, guild, audioDir: dir, registry, onSpeaker: (id, name) => seen.push([id, name]) });

    connection.receiver.speaking.emit('start', 'u9');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(seen, [['u9', 'Latecomer']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A throw while starting a track (e.g. the native opus module failing to load
// after a system libc upgrade) must NOT escape the speaking-start listener and
// crash the whole process mid-meeting. Regression for the glibc-2.44 opus crash.
test('a throwing track start is swallowed and does not crash the emitter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-cap3-'));
  try {
    const connection = fakeConnection();
    // subscribe() throws to simulate opus/decoder construction blowing up.
    connection.receiver.subscribe = () => { throw new Error('Cannot find module opus.node'); };
    const guild = fakeGuild({ u1: { displayName: 'Alice', user: { bot: false } } });
    const { TrackRegistry } = await import('../src/voice/capture.js');
    const registry = new TrackRegistry();
    attachCapture({ connection, guild, audioDir: dir, registry });

    // If the throw escaped the listener this would take the process down.
    assert.doesNotThrow(() => connection.receiver.speaking.emit('start', 'u1'));
    await new Promise((r) => setImmediate(r));
    assert.equal(registry.isActive('u1'), false);
    assert.equal(registry.list().length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
