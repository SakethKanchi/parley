import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { normalizeNotes, SUMMARY_PROMPT } from './notes.js';
import { summaryLanguageInstruction } from './languages.js';
import { withRetry } from './errors.js';
import { config } from '../../config/env.js';

const NOTES_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    tldr: { type: SchemaType.STRING },
    topics: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          points: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['title', 'points'],
      },
    },
    decisions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    openQuestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    actionItems: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          assignee: { type: SchemaType.STRING },
          task: { type: SchemaType.STRING },
        },
        required: ['task'],
      },
    },
  },
  required: ['tldr', 'topics', 'decisions', 'openQuestions', 'actionItems'],
};

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
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = model;
    this.model = this.genAI.getGenerativeModel({
      model,
      // Force valid JSON in the StructuredNotes shape; free-text mode let
      // gemini-2.5-flash emit truncated/malformed JSON that dumped the whole
      // blob into tldr (see parseGeminiNotes fallback).
      generationConfig: { responseMimeType: 'application/json', responseSchema: NOTES_SCHEMA },
    });
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nMeeting: ${meta.channelName || ''} on ${meta.date || ''}\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    // GoogleGenerativeAIFetchError carries .status, so withRetry backs off on
    // transient 5xx (e.g. 503 "high demand") and surfaces 401/429 immediately.
    const result = await withRetry(() => this.model.generateContent(prompt));
    return parseGeminiNotes(result.response.text());
  }
  async ask(prompt) {
    const model = this.genAI.getGenerativeModel({ model: this.modelName }); // no responseSchema → free text
    const result = await withRetry(() => model.generateContent(prompt));
    return result.response.text();
  }
}
