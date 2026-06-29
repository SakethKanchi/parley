import { getSummarizer } from './index.js';

export function buildAskPrompt(question, transcript, meta = {}) {
  return `Answer the question using ONLY the meeting transcript below. If the transcript does not contain the answer, say so plainly. Be concise.

Meeting: ${meta.channelName || ''} ${meta.date ? `on ${meta.date}` : ''}
Attendees: ${(meta.attendees || []).join(', ')}

Transcript:
${transcript}

Question: ${question}`;
}

export async function askMeeting({ cfg, env, question, transcript, meta }) {
  const s = getSummarizer(cfg, env);
  if (typeof s.ask !== 'function') throw new Error(`Provider ${cfg.summarizerProvider} does not support Q&A`);
  return s.ask(buildAskPrompt(question, transcript, meta));
}
