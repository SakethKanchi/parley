/**
 * Pure rendering functions: StructuredNotes + talk-time stats → Discord markdown.
 * No I/O. Used by the delivery layer (Task 18).
 */

/**
 * Group action items by assignee. Null/empty assignee goes to 'Unassigned'.
 * Preserves insertion order.
 *
 * @param {Array<{assignee: string|null, task: string}>} actionItems
 * @returns {Map<string, string[]>}
 */
export function groupActionItems(actionItems) {
  const g = new Map();
  for (const item of actionItems) {
    const key = item.assignee || 'Unassigned';
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(item.task);
  }
  return g;
}

/**
 * Render a StructuredNotes object and talk-time stats to Discord-ready markdown.
 *
 * @param {object} notes - StructuredNotes
 * @param {string} notes.tldr
 * @param {Array<{title: string, points: string[]}>} [notes.topics]
 * @param {string[]} [notes.decisions]
 * @param {string[]} [notes.openQuestions]
 * @param {Array<{assignee: string|null, task: string}>} [notes.actionItems]
 * @param {Array<{displayName: string, ms: number, words: number, pct: number}>} talktime
 * @param {{channelName?: string, date?: string}} meta
 * @returns {string}
 */
export function renderNotes(notes, talktime, meta) {
  const lines = [];
  lines.push(`# 📝 Meeting Notes — ${meta.channelName || 'meeting'} (${meta.date || ''})`);
  lines.push('');
  lines.push('## TL;DR');
  lines.push(notes.tldr || '_No summary._');

  if (notes.topics?.length) {
    lines.push('', '## Topics');
    for (const t of notes.topics) {
      lines.push(`**${t.title}**`);
      for (const p of t.points || []) lines.push(`- ${p}`);
    }
  }

  if (notes.decisions?.length) {
    lines.push('', '## Decisions');
    for (const d of notes.decisions) lines.push(`- ${d}`);
  }

  if (notes.openQuestions?.length) {
    lines.push('', '## Open Questions');
    for (const q of notes.openQuestions) lines.push(`- ${q}`);
  }

  lines.push('', '## Action Items');
  const grouped = groupActionItems(notes.actionItems || []);
  if (grouped.size === 0) lines.push('_None._');
  for (const [who, tasks] of grouped) {
    lines.push(`**${who}**`);
    for (const task of tasks) lines.push(`- [ ] ${task}`);
  }

  if (talktime?.length) {
    lines.push('', '## Talk Time');
    for (const s of talktime) lines.push(`- ${s.displayName}: ${s.pct}% (${s.words} words)`);
  }

  return lines.join('\n');
}

/**
 * Split text into chunks that each fit within `limit` characters.
 * Splits on newlines; a single line longer than limit is hard-split so no
 * emitted chunk can exceed Discord's cap.
 * Default limit is 1900 (safely under Discord's 2000-char message cap).
 *
 * @param {string} text
 * @param {number} [limit=1900]
 * @returns {string[]}
 */
export function chunk(text, limit = 1900) {
  if (text.length <= limit) return [text];
  const out = [];
  let cur = '';
  const pushCur = () => { if (cur) { out.push(cur); cur = ''; } };
  for (const rawLine of text.split('\n')) {
    // Hard-split any single line longer than the limit (e.g. a degraded LLM
    // response dumped into tldr) so no emitted chunk can exceed Discord's cap.
    const segments = rawLine.length > limit ? rawLine.match(new RegExp(`.{1,${limit}}`, 'g')) : [rawLine];
    for (const line of segments) {
      if (cur.length + line.length + 1 > limit) {
        pushCur();
        cur = line;
      } else {
        cur = cur ? `${cur}\n${line}` : line;
      }
    }
  }
  pushCur();
  return out;
}
