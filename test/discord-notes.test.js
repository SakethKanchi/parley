import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderNotes, groupActionItems, chunk } from '../src/delivery/discord-notes.js';

const notes = {
  tldr: 'We discussed the launch.',
  topics: [{ title: 'Launch', points: ['date set', 'owners assigned'] }],
  decisions: ['Launch on Friday'],
  openQuestions: ['Who writes the post?'],
  actionItems: [
    { assignee: 'Alice', task: 'finish API' },
    { assignee: 'Alice', task: 'write tests' },
    { assignee: null, task: 'book venue' },
  ],
};
const talktime = [{ displayName: 'Alice', ms: 60000, words: 120, pct: 75 }, { displayName: 'Bob', ms: 20000, words: 40, pct: 25 }];

test('groupActionItems groups by assignee with Unassigned bucket', () => {
  const g = groupActionItems(notes.actionItems);
  assert.deepEqual(g.get('Alice'), ['finish API', 'write tests']);
  assert.deepEqual(g.get('Unassigned'), ['book venue']);
});

test('renderNotes includes all sections and per-person tasks', () => {
  const md = renderNotes(notes, talktime, { channelName: 'general', date: '2026-06-04' });
  assert.match(md, /We discussed the launch/);
  assert.match(md, /Launch on Friday/);
  assert.match(md, /Who writes the post/);
  assert.match(md, /\*\*Alice\*\*/);
  assert.match(md, /finish API/);
  assert.match(md, /Unassigned/);
  assert.match(md, /Alice.*75%/s);
});

test('chunk splits text under the limit on newlines', () => {
  const parts = chunk('a\nb\nc', 3);
  assert.ok(parts.every((p) => p.length <= 3));
  assert.equal(parts.join('\n'), 'a\nb\nc');
});

test('chunk hard-splits a single line longer than the limit', () => {
  const long = 'x'.repeat(25);
  const parts = chunk(long, 10);
  assert.ok(parts.every((p) => p.length <= 10));
  assert.equal(parts.join(''), long);
});

test('renderNotes omits empty optional sections but keeps Action Items', () => {
  const md = renderNotes(
    { tldr: 'hi', topics: [], decisions: [], openQuestions: [], actionItems: [] },
    [],
    { channelName: 'g', date: 'd' }
  );
  assert.doesNotMatch(md, /## Topics/);
  assert.doesNotMatch(md, /## Decisions/);
  assert.doesNotMatch(md, /## Open Questions/);
  assert.doesNotMatch(md, /## Talk Time/);
  assert.match(md, /## Action Items/);
  assert.match(md, /_None\._/);
});

test('chunk leaves short text as a single piece', () => {
  assert.deepEqual(chunk('short', 1900), ['short']);
});
