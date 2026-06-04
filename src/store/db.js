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
  use_thread INTEGER, auto_join INTEGER, language TEXT
);
`;

export function openDb(path) {
  const sql = new DatabaseSync(path);
  sql.exec('PRAGMA journal_mode = WAL');
  sql.exec(SCHEMA);

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
      return sql.prepare(
        `SELECT u.* FROM utterances_fts f
         JOIN utterances u ON u.id = f.rowid
         JOIN meetings m ON m.id = u.meeting_id
         WHERE m.guild_id = ? AND utterances_fts MATCH ?
         ORDER BY u.meeting_id DESC LIMIT 50`
      ).all(guildId, keyword);
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
      return { ...row, notes: JSON.parse(row.notes_json), talktime: JSON.parse(row.talktime_json) };
    },
  };
}
