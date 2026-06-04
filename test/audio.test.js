import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmName, parsePcmName, pcmToWavArgs } from '../src/voice/audio.js';

test('pcmName + parsePcmName roundtrip (userId may contain no underscores)', () => {
  const name = pcmName('123', 4567);
  assert.equal(name, '123_4567.pcm');
  assert.deepEqual(parsePcmName(name), { userId: '123', startMs: 4567 });
});

test('pcmToWavArgs builds 16k mono s16 ffmpeg args', () => {
  const args = pcmToWavArgs('/in.pcm', '/out.wav');
  assert.deepEqual(args, [
    '-y', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', '/in.pcm',
    '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '/out.wav',
  ]);
});
