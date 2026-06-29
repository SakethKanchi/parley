import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT, channel_id TEXT, channel_name TEXT,
  started_at TEXT, ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'recording'
);
CREATE TABLE IF NOT EXISTS attendees (
  meeting_id INTEGER, user_id TEXT, display_name TEXT,
  UNIQUE(meeting_id, user_id)
);
CREATE TABLE IF NOT EXISTS utterances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER, user_id TEXT, display_name TEXT,
  start_ms INTEGER, end_ms INTEGER, text TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS utterances_fts USING fts5(
  text, meeting_id UNINDEXED, content='utterances', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS utterances_ai AFTER INSERT ON utterances BEGIN
  INSERT INTO utterances_fts(rowid, text, meeting_id) VALUES (new.id, new.text, new.meeting_id);
END;
CREATE TABLE IF NOT EXISTS summaries (
  meeting_id INTEGER PRIMARY KEY,
  notes_json TEXT, talktime_json TEXT, model_used TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  summarizer_provider TEXT, summarizer_model TEXT,
  whisper_model TEXT, notes_channel_id TEXT,
  use_thread INTEGER, auto_join INTEGER, language TEXT, summary_language TEXT
);
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  meeting_id INTEGER,
  assignee TEXT,
  task TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS todos_dedup ON todos(meeting_id, COALESCE(assignee, ''), task);
`;

export function openDb(path) {
  const sql = new DatabaseSync(path);
  sql.exec('PRAGMA journal_mode = WAL');
  sql.exec(SCHEMA);

  // Migration: add summary_language to dbs created before the column existed.
  const cols = sql.prepare(`PRAGMA table_info(guild_config)`).all();
  if (!cols.some((c) => c.name === 'summary_language')) {
    sql.exec(`ALTER TABLE guild_config ADD COLUMN summary_language TEXT`);
  }

  return {
    sql,
    createMeeting({ guildId, channelId, channelName, startedAt }) {
      const r = sql.prepare(
        `INSERT INTO meetings (guild_id, channel_id, channel_name, started_at, status)
         VALUES (?, ?, ?, ?, 'recording')`
      ).run(guildId, channelId, channelName, startedAt);
      return r.lastInsertRowid;
    },
    getMeeting(id) { return sql.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id); },
    setMeetingStatus(id, status, endedAt = null) {
      sql.prepare(`UPDATE meetings SET status = ?, ended_at = COALESCE(?, ended_at) WHERE id = ?`)
        .run(status, endedAt, id);
    },
    listRecent(guildId, limit = 10) {
      return sql.prepare(`SELECT * FROM meetings WHERE guild_id = ? ORDER BY id DESC LIMIT ?`).all(guildId, limit);
    },
    findOrphanedMeetings() {
      return sql.prepare(`SELECT * FROM meetings WHERE status IN ('recording','processing') ORDER BY id`).all();
    },
    addAttendee(meetingId, userId, displayName) {
      sql.prepare(`INSERT OR IGNORE INTO attendees (meeting_id, user_id, display_name) VALUES (?, ?, ?)`)
        .run(meetingId, userId, displayName);
    },
    listAttendees(meetingId) {
      return sql.prepare(`SELECT * FROM attendees WHERE meeting_id = ?`).all(meetingId);
    },
    addUtterance({ meetingId, userId, displayName, startMs, endMs, text }) {
      sql.prepare(`INSERT INTO utterances (meeting_id, user_id, display_name, start_ms, end_ms, text)
                   VALUES (?, ?, ?, ?, ?, ?)`).run(meetingId, userId, displayName, startMs, endMs, text);
    },
    listUtterances(meetingId) {
      return sql.prepare(`SELECT * FROM utterances WHERE meeting_id = ? ORDER BY start_ms`).all(meetingId);
    },
    searchUtterances(guildId, keyword) {
      // Bind user input as a quoted FTS5 phrase literal so operator chars never throw.
      const safe = `"${String(keyword).replace(/"/g, '""')}"`;
      return sql.prepare(
        `SELECT u.* FROM utterances_fts f
         JOIN utterances u ON u.id = f.rowid
         JOIN meetings m ON m.id = u.meeting_id
         WHERE m.guild_id = ? AND utterances_fts MATCH ?
         ORDER BY u.meeting_id DESC LIMIT 50`
      ).all(guildId, safe);
    },
    saveSummary(meetingId, notes, talktime, modelUsed, createdAt = new Date().toISOString()) {
      sql.prepare(
        `INSERT OR REPLACE INTO summaries (meeting_id, notes_json, talktime_json, model_used, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(meetingId, JSON.stringify(notes), JSON.stringify(talktime), modelUsed, createdAt);
    },
    getSummary(meetingId) {
      const row = sql.prepare(`SELECT * FROM summaries WHERE meeting_id = ?`).get(meetingId);
      if (!row) return null;
      const { notes_json, talktime_json, ...rest } = row;
      return { ...rest, notes: JSON.parse(notes_json), talktime: JSON.parse(talktime_json) };
    },
    seedTodos(meetingId, guildId, actionItems, createdAt = new Date().toISOString()) {
      const stmt = sql.prepare(
        `INSERT OR IGNORE INTO todos (guild_id, meeting_id, assignee, task, created_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      let n = 0;
      for (const a of actionItems || []) {
        if (!a || !a.task) continue;
        const r = stmt.run(guildId, meetingId, a.assignee ?? null, a.task, createdAt);
        n += r.changes;
      }
      return n;
    },
    listTodos(guildId, { open = false, assignee } = {}) {
      const where = ['guild_id = ?'];
      const args = [guildId];
      if (open) where.push('done = 0');
      if (assignee !== undefined) {
        if (assignee === null) where.push('assignee IS NULL');
        else { where.push('assignee = ?'); args.push(assignee); }
      }
      return sql.prepare(`SELECT * FROM todos WHERE ${where.join(' AND ')} ORDER BY id DESC`).all(...args);
    },
    listAssignees(guildId) {
      // NULL sorts first (SQLite), then alphabetical — the dropdown renders NULL as "Unassigned".
      return sql.prepare(
        `SELECT DISTINCT assignee FROM todos WHERE guild_id = ? ORDER BY assignee IS NOT NULL, assignee`
      ).all(guildId);
    },
    setTodoDone(id, done) {
      sql.prepare(`UPDATE todos SET done = ? WHERE id = ?`).run(done ? 1 : 0, id);
    },
    listGuilds() {
      return sql.prepare(
        `SELECT guild_id FROM meetings WHERE guild_id IS NOT NULL
         UNION SELECT guild_id FROM guild_config WHERE guild_id IS NOT NULL`
      ).all();
    },
    backfillTodos() {
      const rows = sql.prepare(
        `SELECT s.meeting_id, m.guild_id, s.notes_json
           FROM summaries s JOIN meetings m ON m.id = s.meeting_id`
      ).all();
      let n = 0;
      for (const row of rows) {
        const notes = JSON.parse(row.notes_json);
        n += this.seedTodos(row.meeting_id, row.guild_id, notes.actionItems || []);
      }
      return n;
    },
  };
}
