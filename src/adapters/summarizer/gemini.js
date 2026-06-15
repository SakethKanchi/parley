import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizeNotes, SUMMARY_PROMPT } from './notes.js';
import { summaryLanguageInstruction } from './languages.js';
import { withRetry } from './errors.js';
import { config } from '../../config/env.js';

export function parseGeminiNotes(raw = '') {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : raw;
  try {
    return normalizeNotes(JSON.parse(candidate.trim()));
  } catch {
    const brace = candidate.match(/\{[\s\S]*\}/);
    if (brace) {
      try { return normalizeNotes(JSON.parse(brace[0])); } catch { /* fall through */ }
    }
    return normalizeNotes({ tldr: raw.trim() });
  }
}

export class GeminiSummarizer {
  constructor(model, apiKey = config.gemini.apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env');
    this.model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model });
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nMeeting: ${meta.channelName || ''} on ${meta.date || ''}\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    // GoogleGenerativeAIFetchError carries .status, so withRetry backs off on
    // transient 5xx (e.g. 503 "high demand") and surfaces 401/429 immediately.
    const result = await withRetry(() => this.model.generateContent(prompt));
    return parseGeminiNotes(result.response.text());
  }
}
