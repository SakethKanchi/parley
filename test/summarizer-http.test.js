import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaSummarizer } from '../src/adapters/summarizer/ollama.js';
import { OpenAISummarizer } from '../src/adapters/summarizer/openai.js';
import { getSummarizer } from '../src/adapters/summarizer/index.js';

const okJson = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('OllamaSummarizer parses message content JSON', async () => {
  const fetchImpl = okJson({ message: { content: '{"tldr":"o","actionItems":[]}' } });
  const s = new OllamaSummarizer('qwen', 'http://x', fetchImpl);
  const out = await s.summarize('t', { attendees: [] });
  assert.equal(out.tldr, 'o');
});

test('OpenAISummarizer parses choices[0].message.content JSON', async () => {
  const fetchImpl = okJson({ choices: [{ message: { content: '{"tldr":"oa","actionItems":[]}' } }] });
  const s = new OpenAISummarizer('gpt-x', 'http://x', 'key', fetchImpl);
  const out = await s.summarize('t', { attendees: [] });
  assert.equal(out.tldr, 'oa');
});

test('getSummarizer builds ollama + openai providers', () => {
  assert.equal(getSummarizer({ summarizerProvider: 'ollama', summarizerModel: 'qwen' }).constructor.name, 'OllamaSummarizer');
  assert.equal(
    getSummarizer({ summarizerProvider: 'openai', summarizerModel: 'gpt-x' }, { openai: { apiKey: 'k', baseUrl: 'http://x' } }).constructor.name,
    'OpenAISummarizer'
  );
});
