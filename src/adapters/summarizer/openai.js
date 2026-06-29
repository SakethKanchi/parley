import { parseGeminiNotes } from './gemini.js';
import { SUMMARY_PROMPT } from './notes.js';
import { summaryLanguageInstruction } from './languages.js';
import { httpError, withRetry } from './errors.js';
import { config } from '../../config/env.js';

export class OpenAISummarizer {
  constructor(model, baseUrl = config.openai.baseUrl, apiKey = config.openai.apiKey, fetchImpl = fetch) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env');
    this.model = model; this.baseUrl = baseUrl; this.apiKey = apiKey; this.fetchImpl = fetchImpl;
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    const body = await withRetry(async () => {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw httpError('OpenAI', res.status, await res.text().catch(() => ''));
      return res.json();
    });
    return parseGeminiNotes(body.choices?.[0]?.message?.content ?? '');
  }
  async ask(prompt) {
    const body = await withRetry(async () => {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) throw httpError('OpenAI', res.status, await res.text().catch(() => ''));
      return res.json();
    });
    return body.choices?.[0]?.message?.content ?? '';
  }
}
