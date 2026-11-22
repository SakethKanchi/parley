import { NOTES_SCHEMA } from './gemini.js';
import { normalizeNotes, summaryPrompt } from './notes.js';
import { summaryLanguageInstruction } from './languages.js';
import { httpError, withRetry } from './errors.js';
import { config } from '../../config/env.js';

const CONTEXT_TOKENS = 8192;
const TRANSCRIPT_CHUNK_SIZE = 6500;
const OVERVIEW_GROUP_SIZE = 8;
export const DEFAULT_OVERVIEW_PROMPT = 'Write a 2–4 sentence overview using only the chronological summaries below.';
const overviewSentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });

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

function noteKey(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueBy(items, key) {
  const unique = new Map();
  for (const item of items) {
    const id = key(item);
    if (!unique.has(id)) unique.set(id, item);
  }
  return [...unique.values()];
}

function conciseOverview(text, maxSentences) {
  const sentences = Array.from(overviewSentences.segment(text), ({ segment }) => segment.trim())
    .filter((sentence) => /[.!?…]["'»”’)]*$/.test(sentence));
  const unique = uniqueBy(sentences, noteKey);
  return (unique.length > maxSentences
    ? [...unique.slice(0, maxSentences - 1), unique.at(-1)]
    : unique).join(' ');
}

function combineNotes(parts, tldr) {
  const topics = new Map();
  for (const { title, points } of parts.flatMap((part) => part.topics)) {
    const key = noteKey(title);
    if (!topics.has(key)) topics.set(key, { title, points: [] });
    topics.get(key).points.push(...points);
  }
  return {
    tldr,
    topics: [...topics.values()].map(({ title, points }) => ({ title, points: uniqueBy(points, noteKey) })),
    decisions: uniqueBy(parts.flatMap((part) => part.decisions), noteKey),
    openQuestions: uniqueBy(parts.flatMap((part) => part.openQuestions), noteKey),
    actionItems: uniqueBy(parts.flatMap((part) => part.actionItems), ({ assignee, task }) =>
      JSON.stringify([noteKey(assignee || ''), noteKey(task)])),
  };
}

export class OllamaSummarizer {
  constructor(model, url = config.ollama.url, fetchImpl = fetch, { overviewPrompt } = {}) {
    this.model = model; this.url = url; this.fetchImpl = fetchImpl;
    this.overviewPrompt = overviewPrompt ?? DEFAULT_OVERVIEW_PROMPT;
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

  async structuredResponse(prompt, format, numPredict) {
    const request = (input, limit) => this.chat(input, {
      format,
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
    return JSON.parse(body.message?.content ?? '');
  }

  async structuredNotes(prompt, numPredict) {
    const notes = await this.structuredResponse(prompt, NOTES_SCHEMA, numPredict);
    if (typeof notes?.tldr !== 'string' ||
        !['topics', 'decisions', 'openQuestions', 'actionItems'].every((key) => Array.isArray(notes[key]))) {
      throw new Error('Ollama returned an incomplete meeting notes object.');
    }
    return normalizeNotes(notes);
  }

  async combineOverviews(parts, meta) {
    let overviews = parts.map((part) => part.tldr.trim()).filter(Boolean);
    const language = summaryLanguageInstruction(meta.summaryLanguage);
    while (overviews.length > 1) {
      const finalPass = overviews.length <= OVERVIEW_GROUP_SIZE;
      const extended = finalPass && this.overviewPrompt !== DEFAULT_OVERVIEW_PROMPT;
      const maxSentences = extended ? 8 : 4;
      const stage = finalPass ? 'This is the final overview.' : 'This is an intermediate overview.';
      const merged = [];
      for (let start = 0; start < overviews.length; start += OVERVIEW_GROUP_SIZE) {
        const group = overviews.slice(start, start + OVERVIEW_GROUP_SIZE);
        if (group.length === 1) {
          merged.push(group[0]);
          continue;
        }
        const input = group.map((overview) => overview.slice(0, 600)).join('\n');
        const prompt = `${this.overviewPrompt}${language}\n\n${stage} Return only one plain-text paragraph, at most ${maxSentences} sentences, without a title or JSON.\n\n${input}`;
        try {
          const reply = await this.chat(prompt, {
            options: { num_ctx: CONTEXT_TOKENS, num_predict: extended ? 650 : 360, temperature: 0.1 },
          });
          const text = reply.message?.content?.trim() ?? '';
          const overview = conciseOverview(text, maxSentences) || (reply.done_reason === 'stop' ? text : '');
          if (!overview) throw new Error('Empty overview');
          merged.push(overview);
        } catch {
          // The detailed notes can still be saved when overview generation fails.
          merged.push(conciseOverview(group.join(' '), maxSentences) || group[0]);
        }
      }
      overviews = merged;
    }
    return overviews[0] ?? '';
  }

  async summarize(transcript, meta) {
    const instructions = `${summaryPrompt(meta)}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nAttendees: ${(meta.attendees || []).join(', ')}`;
    if (transcript.length <= TRANSCRIPT_CHUNK_SIZE) {
      return this.structuredNotes(`${instructions}\n\nTranscript:\n${transcript}`, 1800);
    }

    // Keep each request inside the context window and retain the detailed notes
    // from every excerpt without asking the model to generate them a second time.
    const chunks = splitTranscript(transcript);
    const parts = [];
    const concise = 'Keep each point short and use at most 3 topics, 3 decisions, 3 open questions, and 4 action items for this section.';
    for (const [index, chunk] of chunks.entries()) {
      parts.push(await this.structuredNotes(
        `${instructions}\n\nExtract only information supported by this excerpt. ${concise}\n\nTranscript part ${index + 1} of ${chunks.length}:\n${chunk}`,
        1000,
      ));
    }
    return combineNotes(parts, await this.combineOverviews(parts, meta));
  }

  async ask(prompt) {
    const body = await this.chat(prompt);
    return body.message?.content ?? '';
  }
}
