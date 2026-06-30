import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { SidecarController } from '../src/sidecar-controller.js';

// A fake child process: an EventEmitter with stdout/stderr streams + kill().
function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = (sig) => { child.killed = true; child.signal = sig; child.emit('exit', 0); return true; };
  return child;
}

// Build a controller with controllable health responses + spawn capture.
function make({ healthSeq = [], exists = () => true } = {}) {
  let healthIdx = 0;
  const spawned = [];
  const fetch = async () => {
    const ok = healthSeq[Math.min(healthIdx, healthSeq.length - 1)] ?? false;
    healthIdx++;
    if (!ok) throw new Error('ECONNREFUSED');
    return { ok: true };
  };
  const lastChild = { ref: null };
  const spawn = (cmd, args, opts) => {
    const child = fakeChild();
    spawned.push({ cmd, args, opts, child });
    lastChild.ref = child;
    return child;
  };
  const sc = new SidecarController({ sttUrl: 'http://127.0.0.1:8000', deps: { spawn, fetch, exists } });
  return { sc, spawned, lastChild };
}

test('managed() requires a local url and an installed venv', () => {
  const local = new SidecarController({ sttUrl: 'http://127.0.0.1:8000', deps: { exists: () => true } });
  assert.equal(local.managed(), true);
  const remote = new SidecarController({ sttUrl: 'http://stt:8000', deps: { exists: () => true } });
  assert.equal(remote.managed(), false);
  const noVenv = new SidecarController({ sttUrl: 'http://127.0.0.1:8000', deps: { exists: () => false } });
  assert.equal(noVenv.managed(), false);
});

test('start() adopts an already-healthy sidecar without spawning', async () => {
  const { sc, spawned } = make({ healthSeq: [true] });
  const r = await sc.start();
  assert.equal(r.ok, true);
  assert.equal(sc.state, 'running');
  assert.equal(sc.external, true);
  assert.equal(spawned.length, 0);
});

test('start() spawns when nothing is listening, then becomes healthy', async () => {
  // First health check (pre-spawn) fails, subsequent poll succeeds.
  const { sc, spawned } = make({ healthSeq: [false, true] });
  const r = await sc.start({ waitMs: 2000 });
  assert.equal(r.ok, true);
  assert.equal(sc.state, 'running');
  assert.equal(sc.external, false);
  assert.equal(spawned.length, 1);
  // Passes STT_HOST/PORT derived from the url.
  assert.equal(spawned[0].opts.env.STT_PORT, '8000');
  assert.equal(spawned[0].opts.env.STT_HOST, '127.0.0.1');
});

test('start() refuses when unmanaged (remote url)', async () => {
  const sc = new SidecarController({ sttUrl: 'http://stt:8000', deps: { exists: () => true, fetch: async () => { throw new Error('down'); } } });
  const r = await sc.start();
  assert.equal(r.ok, false);
  assert.match(r.error, /managed elsewhere/);
});

test('start() reports a helpful error when the venv is missing', async () => {
  const sc = new SidecarController({ sttUrl: 'http://127.0.0.1:8000', deps: { exists: () => false, fetch: async () => { throw new Error('down'); } } });
  const r = await sc.start();
  assert.equal(r.ok, false);
  assert.match(r.error, /not installed/);
});

test('stop() kills a spawned child', async () => {
  const { sc, lastChild } = make({ healthSeq: [false, true] });
  await sc.start({ waitMs: 2000 });
  const child = lastChild.ref;
  const r = await sc.stop();
  assert.equal(r.ok, true);
  assert.equal(sc.state, 'stopped');
  assert.equal(child.killed, true);
});

test('stop() leaves an external sidecar running', async () => {
  const { sc } = make({ healthSeq: [true] });
  await sc.start();
  assert.equal(sc.external, true);
  const r = await sc.stop();
  assert.equal(sc.state, 'stopped');
  assert.match(r.note || '', /left running/i);
});

test('an unexpected child exit flips state to error', async () => {
  const { sc, lastChild } = make({ healthSeq: [false, true] });
  await sc.start({ waitMs: 2000 });
  assert.equal(sc.state, 'running');
  // Simulate a crash (not via stop(), so this.child is still set).
  lastChild.ref.emit('exit', 1);
  assert.equal(sc.state, 'error');
  assert.match(sc.error, /exited/);
});

test('status() snapshot exposes the fields the UI reads', async () => {
  const { sc } = make({ healthSeq: [true] });
  await sc.start();
  const st = sc.status();
  assert.deepEqual(Object.keys(st).sort(), ['error', 'external', 'log', 'managed', 'running', 'state', 'url'].sort());
  assert.equal(st.running, true);
  assert.equal(st.managed, true);
});
