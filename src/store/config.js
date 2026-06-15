export const DEFAULTS = {
  summarizerProvider: 'gemini',
  summarizerModel: 'gemini-2.5-flash',
  whisperModel: 'small',
  notesChannelId: null,
  useThread: true,
  autoJoin: true,
  language: 'auto',
  summaryLanguage: 'en',
};

const COLS = {
  summarizerProvider: 'summarizer_provider',
  summarizerModel: 'summarizer_model',
  whisperModel: 'whisper_model',
  notesChannelId: 'notes_channel_id',
  useThread: 'use_thread',
  autoJoin: 'auto_join',
  language: 'language',
  summaryLanguage: 'summary_language',
};

function fromRow(row) {
  return {
    summarizerProvider: row.summarizer_provider ?? DEFAULTS.summarizerProvider,
    summarizerModel: row.summarizer_model ?? DEFAULTS.summarizerModel,
    whisperModel: row.whisper_model ?? DEFAULTS.whisperModel,
    notesChannelId: row.notes_channel_id ?? DEFAULTS.notesChannelId,
    useThread: row.use_thread == null ? DEFAULTS.useThread : !!row.use_thread,
    autoJoin: row.auto_join == null ? DEFAULTS.autoJoin : !!row.auto_join,
    language: row.language ?? DEFAULTS.language,
    summaryLanguage: row.summary_language ?? DEFAULTS.summaryLanguage,
  };
}

export function getGuildConfig(db, guildId) {
  const row = db.sql.prepare(`SELECT * FROM guild_config WHERE guild_id = ?`).get(guildId);
  return { guildId, ...(row ? fromRow(row) : DEFAULTS) };
}

export function setGuildConfig(db, guildId, patch) {
  const current = getGuildConfig(db, guildId);
  // Drop undefined keys (node:sqlite cannot bind undefined) and pin guildId so a
  // stray patch key can't corrupt the row identity or the returned object.
  const safePatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const merged = { ...current, ...safePatch, guildId };
  db.sql.prepare(
    `INSERT OR REPLACE INTO guild_config
       (guild_id, summarizer_provider, summarizer_model, whisper_model, notes_channel_id, use_thread, auto_join, language, summary_language)
     VALUES (@guildId, @summarizerProvider, @summarizerModel, @whisperModel, @notesChannelId, @useThread, @autoJoin, @language, @summaryLanguage)`
  ).run({
    guildId,
    summarizerProvider: merged.summarizerProvider,
    summarizerModel: merged.summarizerModel,
    whisperModel: merged.whisperModel,
    notesChannelId: merged.notesChannelId,
    useThread: merged.useThread ? 1 : 0,
    autoJoin: merged.autoJoin ? 1 : 0,
    language: merged.language,
    summaryLanguage: merged.summaryLanguage,
  });
  return merged;
}

export const CONFIG_COLS = COLS;
