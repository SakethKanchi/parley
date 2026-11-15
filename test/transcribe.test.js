import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const { utterances: utts, failures } = await transcribeTracks(tracks, { whisperModel: 'small', language: 'auto' }, deps);
  assert.equal(failures.length, 0);
  assert.equal(utts.length, 2);
  assert.equal(utts[0].displayName, 'Alice');
  assert.equal(utts[0].text, 'hello');
  assert.equal(utts[0].startMs, 0);
});

test('transcribeTracks skips empty transcripts', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' }];
  const deps = { convert: async (p, w) => w, stt: async () => ({ text: '   ', words: [] }), cleanup: () => {} };
  const { utterances: utts, failures } = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts.length, 0);
  assert.equal(failures.length, 0);
});

test('transcribeTracks computes endMs from last word timestamp', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 1000, pcmPath: '/a.pcm' }];
  const deps = { convert: async (p, w) => w, stt: async () => ({ text: 'hi there', words: [{ start: 0, end: 0.5 }, { start: 0.6, end: 2.0 }] }), cleanup: () => {} };
  const { utterances: utts } = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts[0].endMs, 1000 + 2000); // startMs + last word end (2.0s)
});

for (const model of ['gpt-4o-transcribe', 'gpt-transcribe']) {
  test(`${model} transcripts use recorded PCM duration when timestamps are absent`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'parley-transcribe-test-'));
    try {
      const pcmPath = join(dir, 'speaker.pcm');
      // 2.5 seconds of 16 kHz mono, 16-bit audio.
      await writeFile(pcmPath, Buffer.alloc(80_000));
      const { utterances, failures } = await transcribeTracks(
        [{ userId: 'u1', displayName: 'Alice', startMs: 1000, pcmPath }],
        { sttProvider: 'openai', sttModel: model },
        {
          env: { openai: { apiKey: 'test', baseUrl: 'https://api.openai.com/v1' } },
          sttDeps: { fetchImpl: async (_url, { body }) => {
            assert.equal(body.get('model'), model);
            assert.equal(body.get('response_format'), 'json');
            assert.equal(body.has('timestamp_granularities[]'), false);
            return { ok: true, json: async () => ({ text: 'hello team' }) };
          } },
        },
      );
      assert.deepEqual(failures, []);
      assert.deepEqual(utterances, [{ userId: 'u1', displayName: 'Alice', startMs: 1000, endMs: 3500, text: 'hello team' }]);
      await assert.rejects(access(pcmPath.replace(/\.pcm$/, '.wav')), { code: 'ENOENT' });
      await access(pcmPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test('transcribeTracks preserves original track order regardless of completion order', async () => {
  const tracks = [
    { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
    { userId: 'u2', displayName: 'Bob', startMs: 1000, pcmPath: '/b.pcm' },
    { userId: 'u3', displayName: 'Cara', startMs: 2000, pcmPath: '/c.pcm' },
    { userId: 'u4', displayName: 'Dan', startMs: 3000, pcmPath: '/d.pcm' },
  ];
  // Slower tracks finish first by inverting the artificial delay per index,
  // so if the pool didn't collect by index, output order would scramble.
  const delays = { '/a.pcm': 30, '/b.pcm': 20, '/c.pcm': 10, '/d.pcm': 0 };
  const deps = {
    concurrency: 4,
    convert: async (p, w) => w,
    stt: async (wav) => {
      await new Promise((r) => setTimeout(r, delays[wav]));
      return { text: `said-${wav}`, words: [{ start: 0, end: 1 }] };
    },
    cleanup: () => {},
  };
  const { utterances: utts } = await transcribeTracks(tracks, {}, deps);
  assert.deepEqual(utts.map((u) => u.userId), ['u1', 'u2', 'u3', 'u4']);
});

test('transcribeTracks respects the concurrency limit (max simultaneous in-flight)', async () => {
  const tracks = Array.from({ length: 8 }, (_, i) => ({
    userId: `u${i}`,
    displayName: `User${i}`,
    startMs: i * 1000,
    pcmPath: `/t${i}.pcm`,
  }));
  let inFlight = 0;
  let maxInFlight = 0;
  const deps = {
    concurrency: 3,
    convert: async (p, w) => w,
    stt: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { text: 'hi', words: [{ start: 0, end: 1 }] };
    },
    cleanup: () => {},
  };
  const { utterances: utts } = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts.length, 8);
  assert.ok(maxInFlight <= 3, `expected max in-flight <= 3, got ${maxInFlight}`);
  assert.equal(maxInFlight, 3); // with 8 tracks and pool of 3, should actually saturate
});

test('transcribeTracks defaults concurrency to 4 for openai and 2 otherwise', async () => {
  const tracks = Array.from({ length: 6 }, (_, i) => ({
    userId: `u${i}`,
    displayName: `User${i}`,
    startMs: i * 1000,
    pcmPath: `/t${i}.pcm`,
  }));
  async function measure(cfg) {
    let inFlight = 0;
    let maxInFlight = 0;
    const deps = {
      convert: async (p, w) => w,
      stt: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return { text: 'hi', words: [{ start: 0, end: 1 }] };
      },
      cleanup: () => {},
    };
    await transcribeTracks(tracks, cfg, deps);
    return maxInFlight;
  }
  assert.equal(await measure({ sttProvider: 'openai' }), 4);
  assert.equal(await measure({ sttProvider: 'sidecar' }), 2);
});

test('transcribeTracks keeps successful tracks when some tracks fail (partial failure)', async () => {
  const tracks = [
    { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
    { userId: 'u2', displayName: 'Bob', startMs: 1000, pcmPath: '/bad.pcm' },
    { userId: 'u3', displayName: 'Cara', startMs: 2000, pcmPath: '/c.pcm' },
  ];
  const deps = {
    convert: async (p, w) => w,
    stt: async (wav) => {
      if (wav.includes('bad')) throw new Error('corrupt pcm');
      return { text: `said-${wav}`, words: [{ start: 0, end: 1 }] };
    },
    cleanup: () => {},
  };
  const { utterances: utts, failures } = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts.length, 2);
  assert.deepEqual(utts.map((u) => u.userId), ['u1', 'u3']);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].userId, 'u2');
  assert.match(failures[0].error, /corrupt pcm/);
});

test('transcribeTracks still cleans up the wav file for a failed track', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/bad.pcm' }];
  const cleaned = [];
  const deps = {
    convert: async (p, w) => w,
    stt: async () => { throw new Error('stt exploded'); },
    cleanup: async (p) => { cleaned.push(p); },
  };
  const { utterances, failures } = await transcribeTracks(tracks, {}, deps);
  assert.equal(utterances.length, 0);
  assert.equal(failures.length, 1);
  assert.deepEqual(cleaned, ['/bad.pcm'.replace(/\.pcm$/, '.wav')]);
});

test('transcribeTracks returns all failures (and no utterances) when every track fails', async () => {
  const tracks = [
    { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
    { userId: 'u2', displayName: 'Bob', startMs: 1000, pcmPath: '/b.pcm' },
  ];
  const deps = {
    convert: async (p, w) => w,
    stt: async () => { throw new Error('sidecar down'); },
    cleanup: () => {},
  };
  const { utterances, failures } = await transcribeTracks(tracks, {}, deps);
  assert.equal(utterances.length, 0);
  assert.equal(failures.length, 2);
});
