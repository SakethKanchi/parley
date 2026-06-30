import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAICompatibleSTT, normalize } from '../src/adapters/stt/openai-compatible.js';
import {
  getSTT, resolveSttModel, sttProviderReady, availableSttProviders,
  STT_PROVIDERS, STT_MODELS,
} from '../src/adapters/stt/index.js';

const fakeRead = async () => Buffer.from('RIFFfake');

function captureFetch(responses) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return {
      ok: r.ok, status: r.status,
      json: async () => r.body,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
    };
  };
  return { fetchImpl, calls };
}

// ── normalize ──────────────────────────────────────────────────────────────

test('normalize keeps top-level words and trims text', () => {
  const out = normalize({ text: '  hi there ', words: [{ word: 'hi', start: 0, end: 0.5 }], language: 'en' });
  assert.equal(out.text, 'hi there');
  assert.equal(out.words.length, 1);
  assert.equal(out.words[0].end, 0.5);
  assert.equal(out.language, 'en');
});

test('normalize derives words from segments when words missing', () => {
  const out = normalize({ text: 'a b', segments: [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }] });
  assert.equal(out.words.length, 2);
  assert.equal(out.words[1].end, 2);
});

test('normalize tolerates an empty/garbage body', () => {
  assert.deepEqual(normalize(null), { text: '', words: [], language: undefined });
  assert.deepEqual(normalize({}), { text: '', words: [], language: undefined });
});

// ── createOpenAICompatibleSTT ────────────────────────────────────────────────

test('openai-compatible posts to /audio/transcriptions with bearer + verbose_json', async () => {
  const { fetchImpl, calls } = captureFetch([{ ok: true, status: 200, body: { text: 'hello', words: [{ word: 'hello', start: 0, end: 1 }] } }]);
  const stt = createOpenAICompatibleSTT(
    { baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'sk-test', label: 'Groq STT' },
    { fetchImpl, readFile: fakeRead },
  );
  const out = await stt('/tmp/a.wav', { model: 'whisper-large-v3-turbo', language: 'en' });
  assert.equal(out.text, 'hello');
  assert.equal(out.words[0].end, 1);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
  const form = calls[0].init.body;
  assert.equal(form.get('model'), 'whisper-large-v3-turbo');
  assert.equal(form.get('response_format'), 'verbose_json');
  assert.equal(form.get('language'), 'en');
});

test('openai-compatible omits language when auto', async () => {
  const { fetchImpl, calls } = captureFetch([{ ok: true, status: 200, body: { text: 'x', words: [] } }]);
  const stt = createOpenAICompatibleSTT({ baseUrl: 'http://x/v1', apiKey: 'k' }, { fetchImpl, readFile: fakeRead });
  await stt('/tmp/a.wav', { model: 'whisper-1', language: 'auto' });
  assert.equal(calls[0].init.body.get('language'), null);
});

test('openai-compatible strips trailing slash from baseUrl', async () => {
  const { fetchImpl, calls } = captureFetch([{ ok: true, status: 200, body: { text: 'x', words: [] } }]);
  const stt = createOpenAICompatibleSTT({ baseUrl: 'http://x/v1/', apiKey: 'k' }, { fetchImpl, readFile: fakeRead });
  await stt('/tmp/a.wav', {});
  assert.equal(calls[0].url, 'http://x/v1/audio/transcriptions');
});

test('openai-compatible throws a clear error without an API key', async () => {
  const stt = createOpenAICompatibleSTT({ baseUrl: 'http://x/v1', apiKey: '' }, { fetchImpl: async () => { throw new Error('should not fetch'); }, readFile: fakeRead });
  await assert.rejects(stt('/tmp/a.wav', {}), /API key is not set/);
});

test('openai-compatible surfaces HTTP error body after retries', async () => {
  const { fetchImpl } = captureFetch([
    { ok: false, status: 401, body: 'bad key' },
    { ok: false, status: 401, body: 'bad key' },
  ]);
  await assert.rejects(
    createOpenAICompatibleSTT({ baseUrl: 'http://x/v1', apiKey: 'k' }, { fetchImpl, readFile: fakeRead, retries: 1 })('/tmp/a.wav', {}),
    /HTTP 401: bad key/,
  );
});

test('openai-compatible retries once then succeeds', async () => {
  const { fetchImpl } = captureFetch([new Error('net'), { ok: true, status: 200, body: { text: 'ok', words: [] } }]);
  const out = await createOpenAICompatibleSTT({ baseUrl: 'http://x/v1', apiKey: 'k' }, { fetchImpl, readFile: fakeRead, retries: 1 })('/tmp/a.wav', {});
  assert.equal(out.text, 'ok');
});

// ── resolver / model selection ───────────────────────────────────────────────

test('resolveSttModel uses whisperModel for sidecar', () => {
  assert.equal(resolveSttModel({ sttProvider: 'sidecar', whisperModel: 'medium' }), 'medium');
  assert.equal(resolveSttModel({ whisperModel: 'base' }), 'base'); // provider defaults to sidecar
});

test('resolveSttModel uses sttModel for cloud, falling back to default', () => {
  assert.equal(resolveSttModel({ sttProvider: 'groq', sttModel: 'whisper-large-v3' }), 'whisper-large-v3');
  assert.equal(resolveSttModel({ sttProvider: 'groq' }), 'whisper-large-v3-turbo');
  assert.equal(resolveSttModel({ sttProvider: 'openai' }), 'whisper-1');
});

test('getSTT returns sidecar transcriber by default', async () => {
  const { fetchImpl, calls } = captureFetch([{ ok: true, status: 200, body: { text: 'sb', words: [] } }]);
  const stt = getSTT({ sttProvider: 'sidecar' }, { sttUrl: 'http://side:8000' }, { fetchImpl, readFile: fakeRead });
  const out = await stt('/tmp/a.wav', { model: 'small' });
  assert.equal(out.text, 'sb');
  assert.equal(calls[0].url, 'http://side:8000/transcribe');
});

test('getSTT builds a Groq transcriber hitting groq base url', async () => {
  const { fetchImpl, calls } = captureFetch([{ ok: true, status: 200, body: { text: 'g', words: [] } }]);
  const stt = getSTT({ sttProvider: 'groq' }, { groq: { apiKey: 'gk' } }, { fetchImpl, readFile: fakeRead });
  await stt('/tmp/a.wav', { model: 'whisper-large-v3-turbo' });
  assert.match(calls[0].url, /api\.groq\.com\/openai\/v1\/audio\/transcriptions$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer gk');
});

test('getSTT throws on an unknown provider', () => {
  assert.throws(() => getSTT({ sttProvider: 'nope' }, {}), /Unknown STT provider/);
});

// ── readiness / availability ─────────────────────────────────────────────────

test('sttProviderReady reflects key/url presence', () => {
  assert.equal(sttProviderReady('sidecar', { sttUrl: 'http://x' }).ok, true);
  assert.equal(sttProviderReady('groq', { groq: { apiKey: 'k' } }).ok, true);
  assert.equal(sttProviderReady('groq', { groq: {} }).ok, false);
  assert.equal(sttProviderReady('openai', { openai: { apiKey: '' } }).ok, false);
  assert.equal(sttProviderReady('groq', {}).missing, 'GROQ_API_KEY');
});

test('availableSttProviders lists every provider with models + readiness', () => {
  const list = availableSttProviders({ sttUrl: 'http://x', groq: { apiKey: 'k' }, openai: {} });
  assert.deepEqual(list.map((p) => p.provider), STT_PROVIDERS);
  const groq = list.find((p) => p.provider === 'groq');
  assert.equal(groq.ok, true);
  assert.deepEqual(groq.models, STT_MODELS.groq);
  assert.equal(list.find((p) => p.provider === 'openai').ok, false);
});
