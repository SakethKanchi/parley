// test/db-timings-migration.test.js
// Measurement section (2026-07-03 speed plan): summaries.timings_json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { getGuildConfig } from '../src/store/config.js';

test('openDb adds timings_json to a fresh db', () => {
  const db = openDb(':memory:');
  const cols = db.sql.prepare(`PRAGMA table_info(summaries)`).all();
  assert.ok(cols.some((c) => c.name === 'timings_json'));
});

test('openDb migrates an existing db created before timings_json existed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-db-migration-'));
  const path = join(dir, 'meetings.db');
  let db;
  try {
    // Simulate a pre-migration db: the same summaries table, minus timings_json.
    const raw = new DatabaseSync(path);
    raw.exec(`
      CREATE TABLE meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT, channel_id TEXT, channel_name TEXT,
        started_at TEXT, ended_at TEXT,
        status TEXT NOT NULL DEFAULT 'recording'
      );
      CREATE TABLE summaries (
        meeting_id INTEGER PRIMARY KEY,
        notes_json TEXT, talktime_json TEXT, model_used TEXT, created_at TEXT
      );
      CREATE TABLE guild_config (
        guild_id TEXT PRIMARY KEY, summarizer_provider TEXT,
        summary_language TEXT
      );
    `);
    raw.prepare(`INSERT INTO guild_config (guild_id, summarizer_provider) VALUES ('g', 'ollama')`).run();
    const meetingId = raw.prepare(
      `INSERT INTO meetings (guild_id, channel_id, channel_name, started_at, status) VALUES ('g','c','x','t','done')`
    ).run().lastInsertRowid;
    raw.prepare(
      `INSERT INTO summaries (meeting_id, notes_json, talktime_json, model_used, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(meetingId, JSON.stringify({ tldr: 'old row' }), JSON.stringify([]), 'old:model', 't');
    raw.close();

    // Reopening through openDb must run the migration without losing the
    // pre-existing row, and getSummary must null-safely report no timings.
    db = openDb(path);
    const cols = db.sql.prepare(`PRAGMA table_info(summaries)`).all();
    assert.ok(cols.some((c) => c.name === 'timings_json'));
    const s = db.getSummary(meetingId);
    assert.equal(s.notes.tldr, 'old row');
    assert.equal(s.timings, null);

    // A fresh write on the migrated db round-trips timings.
    db.saveSummary(meetingId, { tldr: 'new' }, [], 'new:model', 't2', { transcribeMs: 10, summarizeMs: 5, tracks: 1 });
    const updated = db.getSummary(meetingId);
    assert.equal(updated.timings.transcribeMs, 10);
    assert.equal(updated.timings.summarizeMs, 5);
    assert.ok(db.sql.prepare(`PRAGMA table_info(guild_config)`).all().some((c) => c.name === 'summary_prompt'));
    assert.equal(getGuildConfig(db, 'g').summaryPrompt, null);
  } finally {
    db?.sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
