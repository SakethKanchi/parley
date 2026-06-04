import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeTracks } from '../src/pipeline/transcribe.js';

test('transcribeTracks maps each track to a labeled utterance', async () => {
  const tracks = [
    { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
    { userId: 'u2', displayName: 'Bob', startMs: 2000, pcmPath: '/b.pcm' },
  ];
  const deps = {
    convert: async (pcm, wav) => wav,
    stt: async (wav) => ({ text: wav.includes('a') ? 'hello' : 'hi', words: [{ start: 0, end: 1 }] }),
    cleanup: () => {},
  };
  const utts = await transcribeTracks(tracks, { whisperModel: 'small', language: 'auto' }, deps);
  assert.equal(utts.length, 2);
  assert.equal(utts[0].displayName, 'Alice');
  assert.equal(utts[0].text, 'hello');
  assert.equal(utts[0].startMs, 0);
});

test('transcribeTracks skips empty transcripts', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' }];
  const deps = { convert: async (p, w) => w, stt: async () => ({ text: '   ', words: [] }), cleanup: () => {} };
  const utts = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts.length, 0);
});

test('transcribeTracks computes endMs from last word timestamp', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 1000, pcmPath: '/a.pcm' }];
  const deps = { convert: async (p, w) => w, stt: async () => ({ text: 'hi there', words: [{ start: 0, end: 0.5 }, { start: 0.6, end: 2.0 }] }), cleanup: () => {} };
  const utts = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts[0].endMs, 1000 + 2000); // startMs + last word end (2.0s)
});
