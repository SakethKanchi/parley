import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusOf, isRetryable, httpError, describeSummarizerError, withRetry,
} from '../src/adapters/summarizer/errors.js';
import { OpenAISummarizer } from '../src/adapters/summarizer/openai.js';

test('statusOf reads status from common SDK error shapes', () => {
  assert.equal(statusOf({ status: 503 }), 503);
  assert.equal(statusOf({ statusCode: 429 }), 429);
  assert.equal(statusOf({ response: { status: 500 } }), 500);
  assert.equal(statusOf(new Error('boom')), null);
});

test('isRetryable: only transient 5xx, not 429/auth', () => {
  for (const s of [500, 502, 503, 504]) assert.equal(isRetryable({ status: s }), true, `${s}`);
  for (const s of [400, 401, 403, 429]) assert.equal(isRetryable({ status: s }), false, `${s}`);
});

test('describeSummarizerError gives actionable messages', () => {
  assert.match(describeSummarizerError({ status: 401 }, 'gemini'), /Authentication failed/);
  assert.match(describeSummarizerError({ status: 429 }, 'gemini'), /credits|quota/i);
  assert.match(describeSummarizerError({ status: 503 }, 'gemini'), /overloaded/);
  assert.equal(describeSummarizerError(new Error('weird'), 'gemini'), 'weird');
});

test('withRetry retries transient 5xx then succeeds', async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw httpError('X', 503);
    return 'ok';
  }, { baseMs: 0, sleep: async () => {} });
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
});

test('withRetry does NOT retry 429 (fails fast on quota)', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls += 1; throw httpError('X', 429); }, { baseMs: 0, sleep: async () => {} }),
    /429/
  );
  assert.equal(calls, 1);
});

test('withRetry gives up after tries and throws last error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls += 1; throw httpError('X', 503); }, { tries: 2, baseMs: 0, sleep: async () => {} }),
    /503/
  );
  assert.equal(calls, 2);
});

test('OpenAISummarizer retries a 503 then parses on success', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503, text: async () => 'overloaded' };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"tldr":"ok"}' } }] }) };
  };
  const s = new OpenAISummarizer('gpt-x', 'http://x', 'key', fetchImpl);
  // patch backoff to zero via monkey-free path: rely on default sleep (small) — keep tries small
  const out = await s.summarize('t', { attendees: [] });
  assert.equal(out.tldr, 'ok');
  assert.equal(calls, 2);
});
