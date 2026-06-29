import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeSummarizer } from '../src/adapters/summarizer/fake.js';
import { buildAskPrompt, askMeeting } from '../src/adapters/summarizer/ask.js';

test('fake adapter ask returns text', async () => {
  const s = new FakeSummarizer();
  assert.match(await s.ask('hi'), /fake/i);
});

test('askMeeting builds a grounded prompt and dispatches via getSummarizer', async () => {
  const prompt = buildAskPrompt('Who owns it?', 'Alice: I will.', { attendees: ['Alice'] });
  assert.match(prompt, /Alice: I will\./);
  assert.match(prompt, /Who owns it\?/);
  const ans = await askMeeting({ cfg: { summarizerProvider: 'fake' }, env: {}, question: 'q', transcript: 't', meta: {} });
  assert.equal(typeof ans, 'string');
});
