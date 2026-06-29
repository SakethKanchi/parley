// test/orchestrator-todos.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { processMeeting } from '../src/pipeline/orchestrator.js';

test('processMeeting seeds todos from action items', async () => {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'gen', startedAt: 'now' });
  const notes = { tldr: 't', topics: [], decisions: [], openQuestions: [],
    actionItems: [{ assignee: 'Alice', task: 'do the thing' }] };
  await processMeeting(db, id, {
    cfg: { summarizerProvider: 'test', summarizerModel: 'm', summaryLanguage: 'en' },
    tracks: [],
    transcribe: async () => [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 10, text: 'hi' }],
    summarizer: { summarize: async () => notes },
  });
  const todos = db.listTodos('g1');
  assert.equal(todos.length, 1);
  assert.equal(todos[0].task, 'do the thing');
  assert.equal(todos[0].assignee, 'Alice');
});
