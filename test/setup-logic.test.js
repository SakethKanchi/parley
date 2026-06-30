import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSetup } from '../src/commands/setup-logic.js';

const env = { gemini: { apiKey: 'g' }, openai: { apiKey: '' }, opencode: { apiKey: '' }, ollama: { url: 'http://x' }, groq: { apiKey: '' }, sttUrl: 'http://127.0.0.1:8000' };

test('accepts gemini when key present', () => {
  const r = validateSetup({ provider: 'gemini', model: 'gemini-2.5-flash' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.summarizerProvider, 'gemini');
});

test('rejects openai when key missing', () => {
  const r = validateSetup({ provider: 'openai', model: 'gpt-x' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /OPENAI_API_KEY/);
});

test('rejects opencode when key missing', () => {
  const r = validateSetup({ provider: 'opencode', model: 'gpt-5.5' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /OPENCODE_API_KEY/);
});

test('accepts opencode when key present', () => {
  const r = validateSetup({ provider: 'opencode', model: 'gpt-5.5' }, { ...env, opencode: { apiKey: 'k' } });
  assert.equal(r.ok, true);
  assert.equal(r.patch.summarizerProvider, 'opencode');
  assert.equal(r.patch.summarizerModel, 'gpt-5.5');
});

test('rejects unknown provider', () => {
  const r = validateSetup({ provider: 'bogus' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /provider/i);
});

test('accepts whisper model + thread + autojoin booleans', () => {
  const r = validateSetup({ whisperModel: 'medium', useThread: false, autoJoin: true }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.whisperModel, 'medium');
  assert.equal(r.patch.useThread, false);
});

test('rejects invalid whisper model', () => {
  const r = validateSetup({ whisperModel: 'humongous' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /whisper/i);
});

test('accepts valid language + summary_language', () => {
  const r = validateSetup({ language: 'de', summary_language: 'en' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.language, 'de');
  assert.equal(r.patch.summaryLanguage, 'en');
});

test('accepts summary_language match', () => {
  const r = validateSetup({ summary_language: 'match' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.summaryLanguage, 'match');
});

test('rejects unknown transcription language', () => {
  const r = validateSetup({ language: 'zz' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /language/i);
});

test('rejects unknown summary_language', () => {
  const r = validateSetup({ summary_language: 'zz' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /summary language/i);
});

// ── STT provider selection ───────────────────────────────────────────────────

test('accepts sidecar STT provider without a key', () => {
  const r = validateSetup({ sttProvider: 'sidecar' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.sttProvider, 'sidecar');
});

test('rejects groq STT when GROQ_API_KEY missing', () => {
  const r = validateSetup({ sttProvider: 'groq' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /GROQ_API_KEY/);
});

test('accepts groq STT with key and a valid model', () => {
  const r = validateSetup({ sttProvider: 'groq', sttModel: 'whisper-large-v3' }, { ...env, groq: { apiKey: 'k' } });
  assert.equal(r.ok, true);
  assert.equal(r.patch.sttProvider, 'groq');
  assert.equal(r.patch.sttModel, 'whisper-large-v3');
});

test('rejects an invalid groq STT model', () => {
  const r = validateSetup({ sttProvider: 'groq', sttModel: 'whisper-9000' }, { ...env, groq: { apiKey: 'k' } });
  assert.equal(r.ok, false);
  assert.match(r.error, /groq model/i);
});

test('rejects an unknown STT provider', () => {
  const r = validateSetup({ sttProvider: 'magic' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /STT provider/i);
});

test('rejects openai STT when OPENAI_API_KEY missing', () => {
  const r = validateSetup({ sttProvider: 'openai' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /OPENAI_API_KEY/);
});
