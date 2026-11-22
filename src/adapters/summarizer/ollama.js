import { NOTES_SCHEMA } from './gemini.js';
import { normalizeNotes, summaryPrompt } from './notes.js';
import { summaryLanguageInstruction } from './languages.js';
import { httpError, withRetry } from './errors.js';
import { config } from '../../config/env.js';

const CONTEXT_TOKENS = 8192;
const TRANSCRIPT_CHUNK_SIZE = 6500;

function splitTranscript(transcript) {
  const chunks = [];
  for (let start = 0; start < transcript.length;) {
    const limit = Math.min(start + TRANSCRIPT_CHUNK_SIZE, transcript.length);
    const newline = transcript.lastIndexOf('\n', limit - 1);
    let end = limit < transcript.length && newline > start + TRANSCRIPT_CHUNK_SIZE / 2
      ? newline + 1 : limit;
    if (/^[\uD800-\uDBFF]$/.test(transcript[end - 1]) && end < transcript.length) end--;
    chunks.push(transcript.slice(start, end));
    start = end;
  }
  return chunks;
}

export class OllamaSummarizer {
  constructor(model, url = config.ollama.url, fetchImpl = fetch) {
    this.model = model; this.url = url; this.fetchImpl = fetchImpl;
  }

  async chat(prompt, settings = {}) {
    return withRetry(async () => {
      const res = await this.fetchImpl(`${this.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, stream: false, messages: [{ role: 'user', content: prompt }], ...settings }),
      });
      if (!res.ok) throw httpError('Ollama', res.status, await res.text().catch(() => ''));
      return res.json();
    });
  }

  async structuredNotes(prompt, numPredict) {
    const request = (input, limit) => this.chat(input, {
      format: NOTES_SCHEMA,
      options: { num_ctx: CONTEXT_TOKENS, num_predict: limit, temperature: 0.1 },
    });
    let body = await request(prompt, numPredict);
    if (body.done_reason === 'length') {
      body = await request(
        `${prompt}\n\nKeep each point to one short sentence. Return a complete JSON object and omit repetitive details.`,
        Math.min(numPredict + 700, 3000),
      );
    }
    if (body.done_reason === 'length') throw new Error('Ollama reached its output limit while generating meeting notes.');
    const notes = JSON.parse(body.message?.content ?? '');
    if (typeof notes?.tldr !== 'string' ||
        !['topics', 'decisions', 'openQuestions', 'actionItems'].every((key) => Array.isArray(notes[key]))) {
      throw new Error('Ollama returned an incomplete meeting notes object.');
    }
    return normalizeNotes(notes);
  }

  async summarize(transcript, meta) {
    const instructions = `${summaryPrompt(meta)}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nAttendees: ${(meta.attendees || []).join(', ')}`;
    if (transcript.length <= TRANSCRIPT_CHUNK_SIZE) {
      return this.structuredNotes(`${instructions}\n\nTranscript:\n${transcript}`, 1800);
    }

    // Keep the transcript and intermediate notes comfortably inside the context window.
    const chunks = splitTranscript(transcript);
    let parts = [];
    const concise = 'Keep each point short and use at most 3 topics, 3 decisions, 3 open questions, and 4 action items for this section.';
    for (const [index, chunk] of chunks.entries()) {
      parts.push(await this.structuredNotes(
        `${instructions}\n\nExtract only information supported by this excerpt. ${concise}\n\nTranscript part ${index + 1} of ${chunks.length}:\n${chunk}`,
        1000,
      ));
    }
    const mergePrompt = (group, guidance) =>
      `${instructions}\n\nConsolidate these chronological notes. Use only the supplied notes, combine duplicates and keep explicit decisions, open questions, and assignees. ${guidance}\n\nNotes:\n${JSON.stringify(group)}`;
    while (parts.length > 3) {
      const merged = [];
      for (let start = 0; start < parts.length; start += 3) {
        const group = parts.slice(start, start + 3);
        merged.push(group.length === 1 ? group[0] : await this.structuredNotes(
          mergePrompt(group, 'Cover distinct topics briefly. Use up to 5 topics, 4 decisions, 4 open questions, and 6 action items. One short sentence per point.'),
          1100,
        ));
      }
      parts = merged;
    }
    return this.structuredNotes(mergePrompt(parts, 'Write the final notes covering the whole meeting.'), 2200);
  }

  async ask(prompt) {
    const body = await this.chat(prompt);
    return body.message?.content ?? '';
  }
}
