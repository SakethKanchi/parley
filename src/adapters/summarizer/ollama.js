import { parseGeminiNotes } from './gemini.js';
import { SUMMARY_PROMPT } from './notes.js';
import { config } from '../../config/env.js';

export class OllamaSummarizer {
  constructor(model, url = config.ollama.url, fetchImpl = fetch) {
    this.model = model; this.url = url; this.fetchImpl = fetchImpl;
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    const res = await this.fetchImpl(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, stream: false, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const body = await res.json();
    return parseGeminiNotes(body.message?.content ?? '');
  }
}
