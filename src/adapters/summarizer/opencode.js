import { parseGeminiNotes } from './gemini.js';
import { SUMMARY_PROMPT } from './notes.js';
import { httpError, withRetry } from './errors.js';
import { config } from '../../config/env.js';

// OpenCode Zen Go is an OpenAI-compatible model gateway
// (https://opencode.ai/zen/go/v1 — /models, /chat/completions), authed with
// OPENCODE_API_KEY. Same chat/completions shape as OpenAISummarizer; kept a
// separate class so the missing-key message and retry/error labels name
// OpenCode rather than OpenAI.
export class OpenCodeSummarizer {
  constructor(model, baseUrl = config.opencode.baseUrl, apiKey = config.opencode.apiKey, fetchImpl = fetch) {
    if (!apiKey) throw new Error('OPENCODE_API_KEY is not set in .env');
    this.model = model; this.baseUrl = baseUrl; this.apiKey = apiKey; this.fetchImpl = fetchImpl;
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    const body = await withRetry(async () => {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw httpError('OpenCode', res.status, await res.text().catch(() => ''));
      return res.json();
    });
    return parseGeminiNotes(body.choices?.[0]?.message?.content ?? '');
  }
}
