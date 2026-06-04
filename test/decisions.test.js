import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoJoin, shouldAutoLeave } from '../src/voice/decisions.js';

test('shouldAutoJoin true when >1 human and autoJoin enabled and not connected', () => {
  assert.equal(shouldAutoJoin({ humanCount: 2, autoJoin: true, connected: false }), true);
});

test('shouldAutoJoin false when autoJoin disabled', () => {
  assert.equal(shouldAutoJoin({ humanCount: 5, autoJoin: false, connected: false }), false);
});

test('shouldAutoJoin false when already connected', () => {
  assert.equal(shouldAutoJoin({ humanCount: 5, autoJoin: true, connected: true }), false);
});

test('shouldAutoJoin false when <=1 human', () => {
  assert.equal(shouldAutoJoin({ humanCount: 1, autoJoin: true, connected: false }), false);
});

test('shouldAutoLeave true when connected and <=1 human', () => {
  assert.equal(shouldAutoLeave({ humanCount: 1, connected: true }), true);
  assert.equal(shouldAutoLeave({ humanCount: 2, connected: true }), false);
  assert.equal(shouldAutoLeave({ humanCount: 0, connected: false }), false);
});
