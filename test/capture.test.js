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
