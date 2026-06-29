import { normalizeNotes } from './notes.js';

export class FakeSummarizer {
  constructor(canned) { this.canned = canned; }
  async summarize() {
    return normalizeNotes(this.canned || {
      tldr: 'Fake summary.',
      topics: [{ title: 'Topic', points: ['point'] }],
      decisions: ['decided x'],
      openQuestions: ['q?'],
      actionItems: [{ assignee: 'Alice', task: 'do thing' }],
    });
  }
  async ask(prompt) { return this.cannedAnswer || `Fake answer (${String(prompt).length} chars).`; }
}
