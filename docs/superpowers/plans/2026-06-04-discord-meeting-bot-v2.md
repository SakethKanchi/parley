# Discord Meeting Bot v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Discord meeting bot into a per-guild, concurrent recorder that produces speaker-attributed, industry-grade AI meeting notes (summary, decisions, open questions, per-person action items, talk-time) delivered to a Discord thread, with SQLite storage and runtime `/setup` config.

**Architecture:** Node (discord.js, ESM) handles Discord + orchestration; a persistent Python FastAPI sidecar runs faster-whisper with the model loaded once. Per-user Discord audio streams give free speaker attribution. A pluggable summarizer adapter (Gemini default, Ollama/OpenAI swap) returns a fixed `StructuredNotes` shape consumed by storage + delivery.

**Tech Stack:** Node **22.5+** (ESM, native `fetch`, `node --test`, built-in `node:sqlite` with FTS5 — no native compile), discord.js v14, `@discordjs/voice`, `prism-media`, `ffmpeg-static`, `@google/generative-ai`; Python 3.10+, FastAPI, uvicorn, faster-whisper, pytest.

> **Storage note:** Uses Node's built-in `node:sqlite` (`DatabaseSync`), not `better-sqlite3`. The API is nearly identical (`prepare`/`run`/`get`/`all`, `@name` named params with bare object keys, `lastInsertRowid`), but there is no `.pragma()` helper — use `db.exec("PRAGMA ...")`. This avoids a native build and works on Node 22.5+ (verified on 26.x, FTS5 included). Requires `node --test` / `node src/index.js` on Node 22.5+.

---

## Conventions for every task

- Tests use `node:test` + `node:assert/strict` unless noted (Python uses `pytest`).
- Run a single node test file with: `node --test test/<name>.test.js`
- Run all node tests with: `node --test`
- Commit after each task with the message shown.
- The project is ESM: `package.json` has `"type": "module"`; use `import`/`export`.

---

## Task 0: Project scaffold

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `src/.gitkeep`, `test/.gitkeep`, `stt_sidecar/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b feat/v2-rewrite
```

- [ ] **Step 2: Replace `package.json`**

```json
{
  "name": "discord-meeting-bot",
  "version": "2.0.0",
  "description": "Self-hosted Discord bot: records meetings, transcribes per-speaker, posts AI meeting notes.",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test",
    "sidecar": "python stt_sidecar/server.py"
  },
  "license": "ISC",
  "engines": { "node": ">=22.5.0" },
  "dependencies": {
    "@discordjs/opus": "^0.10.0",
    "@discordjs/voice": "^0.19.0",
    "@google/generative-ai": "^0.24.1",
    "discord.js": "^14.22.1",
    "dotenv": "^17.2.3",
    "ffmpeg-static": "^5.2.0",
    "libsodium-wrappers": "^0.7.15",
    "prism-media": "^1.3.5"
  }
}
```

Storage uses the built-in `node:sqlite` module (no `better-sqlite3` dependency, no native compile).

- [ ] **Step 3: Create `.env.example`**

```
# Discord (required)
DISCORD_TOKEN=
DISCORD_CLIENT_ID=

# STT sidecar
STT_URL=http://127.0.0.1:8000

# Summarizer provider keys (only the one you use is required)
GEMINI_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OLLAMA_URL=http://127.0.0.1:11434

# Optional: persistent data dir (defaults to /data if present, else cwd)
DATA_DIR=
```

- [ ] **Step 4: Append to `.gitignore`**

```
# v2
data/
audio/
*.db
*.db-shm
*.db-wal
__pycache__/
.venv/
```

- [ ] **Step 5: Create empty dirs**

```bash
mkdir -p src test stt_sidecar && touch src/.gitkeep test/.gitkeep stt_sidecar/.gitkeep
```

- [ ] **Step 6: Install deps and verify test runner**

Run: `npm install && node --test`
Expected: install succeeds; `node --test` exits 0 with "tests 0".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold v2 project (ESM, deps, env example)"
```

---

## Task 1: config/env.js — typed env + DATA_DIR (defined once)

**Files:**
- Create: `src/config/env.js`
- Test: `test/env.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/env.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDataDir, validateEnv } from '../src/config/env.js';

test('resolveDataDir prefers explicit DATA_DIR', () => {
  assert.equal(resolveDataDir({ DATA_DIR: '/tmp/x' }, () => false), '/tmp/x');
});

test('resolveDataDir falls back to /data when it exists', () => {
  assert.equal(resolveDataDir({}, (p) => p === '/data'), '/data');
});

test('resolveDataDir falls back to cwd when no /data', () => {
  assert.equal(resolveDataDir({}, () => false, '/work'), '/work');
});

test('validateEnv throws when required key missing', () => {
  assert.throws(() => validateEnv({ DISCORD_CLIENT_ID: 'x' }), /DISCORD_TOKEN/);
});

test('validateEnv passes with required keys', () => {
  assert.doesNotThrow(() => validateEnv({ DISCORD_TOKEN: 't', DISCORD_CLIENT_ID: 'c' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/env.test.js`
Expected: FAIL — cannot find module `../src/config/env.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/config/env.js
import { existsSync } from 'node:fs';
import 'dotenv/config';

const REQUIRED = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];

export function resolveDataDir(env = process.env, exists = existsSync, cwd = process.cwd()) {
  if (env.DATA_DIR) return env.DATA_DIR;
  if (exists('/data')) return '/data';
  return cwd;
}

export function validateEnv(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);
  return true;
}

export const config = {
  dataDir: resolveDataDir(),
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  sttUrl: process.env.STT_URL || 'http://127.0.0.1:8000',
  gemini: { apiKey: process.env.GEMINI_API_KEY },
  openai: { apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1' },
  ollama: { url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/env.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/env.js test/env.test.js
git commit -m "feat: typed env config + single DATA_DIR resolver"
```

---

## Task 2: store/db.js — SQLite schema, migrations, core queries

**Files:**
- Create: `src/store/db.js`
- Test: `test/db.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/db.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';

function freshDb() { return openDb(':memory:'); }

test('createMeeting + getMeeting roundtrip', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'general', startedAt: '2026-06-04T10:00:00Z' });
  const m = db.getMeeting(id);
  assert.equal(m.guild_id, 'g');
  assert.equal(m.status, 'recording');
});

test('addAttendee + listAttendees', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.addAttendee(id, 'u1', 'Alice');
  db.addAttendee(id, 'u1', 'Alice'); // idempotent
  assert.deepEqual(db.listAttendees(id).map((a) => a.display_name), ['Alice']);
});

test('addUtterance + search via FTS', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.addUtterance({ meetingId: id, userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'ship the rocket today' });
  const hits = db.searchUtterances('g', 'rocket');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].meeting_id, id);
});

test('saveSummary + getSummary', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  db.saveSummary(id, { tldr: 'hi' }, [{ displayName: 'Alice', ms: 1000, words: 4, pct: 100 }], 'gemini:flash');
  const s = db.getSummary(id);
  assert.equal(s.notes.tldr, 'hi');
  assert.equal(s.talktime[0].displayName, 'Alice');
});

test('setMeetingStatus + listRecent', () => {
  const db = freshDb();
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: '2026-06-04T10:00:00Z' });
  db.setMeetingStatus(id, 'done', '2026-06-04T11:00:00Z');
  const recent = db.listRecent('g', 10);
  assert.equal(recent[0].status, 'done');
});

test('findOrphanedMeetings returns recording/processing', () => {
  const db = freshDb();
  const a = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'x', startedAt: 't' });
  const b = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'y', startedAt: 't' });
  db.setMeetingStatus(b, 'done', 't2');
  assert.deepEqual(db.findOrphanedMeetings().map((m) => m.id), [a]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/db.test.js`
Expected: FAIL — cannot find module `../src/store/db.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/store/db.js
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
      // Bind the user input as a quoted FTS5 phrase literal so operator chars
      // (OR, parentheses, etc.) never throw an fts5 syntax error from a /search typo.
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
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/db.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/db.js test/db.test.js
git commit -m "feat: SQLite store with FTS search and summaries"
```

---

## Task 3: store/config.js — per-guild config with defaults

**Files:**
- Create: `src/store/config.js`
- Test: `test/config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { getGuildConfig, setGuildConfig, DEFAULTS } from '../src/store/config.js';

test('getGuildConfig returns defaults for unknown guild', () => {
  const db = openDb(':memory:');
  assert.deepEqual(getGuildConfig(db, 'g'), { guildId: 'g', ...DEFAULTS });
});

test('setGuildConfig merges and persists partial updates', () => {
  const db = openDb(':memory:');
  setGuildConfig(db, 'g', { summarizerProvider: 'ollama', whisperModel: 'medium' });
  const c = getGuildConfig(db, 'g');
  assert.equal(c.summarizerProvider, 'ollama');
  assert.equal(c.whisperModel, 'medium');
  assert.equal(c.autoJoin, DEFAULTS.autoJoin); // untouched default
});

test('setGuildConfig second update keeps prior values', () => {
  const db = openDb(':memory:');
  setGuildConfig(db, 'g', { summarizerProvider: 'ollama' });
  setGuildConfig(db, 'g', { language: 'es' });
  const c = getGuildConfig(db, 'g');
  assert.equal(c.summarizerProvider, 'ollama');
  assert.equal(c.language, 'es');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — cannot find module `../src/store/config.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/store/config.js
export const DEFAULTS = {
  summarizerProvider: 'gemini',
  summarizerModel: 'gemini-2.5-flash',
  whisperModel: 'small',
  notesChannelId: null,
  useThread: true,
  autoJoin: true,
  language: 'auto',
};

const COLS = {
  summarizerProvider: 'summarizer_provider',
  summarizerModel: 'summarizer_model',
  whisperModel: 'whisper_model',
  notesChannelId: 'notes_channel_id',
  useThread: 'use_thread',
  autoJoin: 'auto_join',
  language: 'language',
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
       (guild_id, summarizer_provider, summarizer_model, whisper_model, notes_channel_id, use_thread, auto_join, language)
     VALUES (@guildId, @summarizerProvider, @summarizerModel, @whisperModel, @notesChannelId, @useThread, @autoJoin, @language)`
  ).run({
    guildId,
    summarizerProvider: merged.summarizerProvider,
    summarizerModel: merged.summarizerModel,
    whisperModel: merged.whisperModel,
    notesChannelId: merged.notesChannelId,
    useThread: merged.useThread ? 1 : 0,
    autoJoin: merged.autoJoin ? 1 : 0,
    language: merged.language,
  });
  return merged;
}

export const CONFIG_COLS = COLS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/config.js test/config.test.js
git commit -m "feat: per-guild runtime config with defaults"
```

---

## Task 4: STT sidecar — faster-whisper FastAPI server

**Files:**
- Create: `stt_sidecar/requirements.txt`
- Create: `stt_sidecar/server.py`
- Test: `stt_sidecar/test_server.py`

- [ ] **Step 1: Create `stt_sidecar/requirements.txt`**

```
faster-whisper>=1.1.0
fastapi>=0.115.0
uvicorn>=0.32.0
python-multipart>=0.0.12
pytest>=8.0.0
httpx>=0.27.0
```

- [ ] **Step 2: Write the failing test**

```python
# stt_sidecar/test_server.py
import io, wave, struct
from fastapi.testclient import TestClient
from server import app, _state

def make_silent_wav(seconds=1, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(struct.pack("<" + "h" * rate * seconds, *([0] * rate * seconds)))
    buf.seek(0)
    return buf

class FakeModel:
    def transcribe(self, path, **kwargs):
        seg = type("S", (), {"text": "hello world", "start": 0.0, "end": 1.0,
                             "words": [type("W", (), {"word": "hello", "start": 0.0, "end": 0.5})()]})()
        info = type("I", (), {"language": "en"})()
        return [seg], info

def test_health():
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"

def test_transcribe_returns_text(monkeypatch):
    _state["model"] = FakeModel()
    _state["model_name"] = "small"  # match the default so get_model() reuses the fake, never builds a real model
    client = TestClient(app)
    wav = make_silent_wav()
    r = client.post("/transcribe", files={"file": ("a.wav", wav, "audio/wav")})
    body = r.json()
    assert body["text"] == "hello world"
    assert body["words"][0]["word"] == "hello"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd stt_sidecar && python -m pytest test_server.py -q`
Expected: FAIL — cannot import `server`.

- [ ] **Step 4: Write minimal implementation**

```python
# stt_sidecar/server.py
import os, tempfile
from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel

app = FastAPI()
_state = {"model": None, "model_name": None}

def get_model(name: str):
    if _state["model"] is None or _state["model_name"] != name:
        _state["model"] = WhisperModel(name, device="auto", compute_type="int8")
        _state["model_name"] = name
    return _state["model"]

@app.get("/health")
def health():
    return {"status": "ok", "model": _state["model_name"]}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), model: str = Form("small"), language: str = Form("auto")):
    m = get_model(model)  # warm: rebuilds only when the requested model name changes
    suffix = os.path.splitext(file.filename or "a.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        lang = None if language == "auto" else language
        segments, info = m.transcribe(path, language=lang, word_timestamps=True)
        words, texts = [], []
        for seg in segments:
            texts.append(seg.text)
            for w in (getattr(seg, "words", None) or []):
                words.append({"word": w.word, "start": w.start, "end": w.end})
        return {"text": " ".join(t.strip() for t in texts).strip(),
                "words": words,
                "language": getattr(info, "language", language)}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass  # cleanup failure must not mask a transcription error

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("STT_PORT", "8000")))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd stt_sidecar && pip install -r requirements.txt && python -m pytest test_server.py -q`
Expected: PASS (2 tests). Note: the real model is never downloaded in tests because `FakeModel` is injected.

- [ ] **Step 6: Commit**

```bash
git add stt_sidecar/requirements.txt stt_sidecar/server.py stt_sidecar/test_server.py
git commit -m "feat: faster-whisper FastAPI sidecar with warm model"
```

---

## Task 5: adapters/stt-client.js — HTTP client to sidecar

**Files:**
- Create: `src/adapters/stt-client.js`
- Test: `test/stt-client.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/stt-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeFile } from '../src/adapters/stt-client.js';

function fakeFetch(responses) {
  let i = 0;
  return async () => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return { ok: r.ok, status: r.status, json: async () => r.body };
  };
}

const fakeRead = async () => Buffer.from('RIFFfake');

test('transcribeFile returns parsed body on success', async () => {
  const fetchImpl = fakeFetch([{ ok: true, status: 200, body: { text: 'hi', words: [] } }]);
  const out = await transcribeFile('/tmp/a.wav', { model: 'small', language: 'auto' },
    { baseUrl: 'http://x', fetchImpl, readFile: fakeRead });
  assert.equal(out.text, 'hi');
});

test('transcribeFile retries once then succeeds', async () => {
  const fetchImpl = fakeFetch([new Error('boom'), { ok: true, status: 200, body: { text: 'ok', words: [] } }]);
  const out = await transcribeFile('/tmp/a.wav', {}, { baseUrl: 'http://x', fetchImpl, readFile: fakeRead, retries: 1 });
  assert.equal(out.text, 'ok');
});

test('transcribeFile throws after exhausting retries', async () => {
  const fetchImpl = fakeFetch([new Error('boom'), new Error('boom2')]);
  await assert.rejects(
    transcribeFile('/tmp/a.wav', {}, { baseUrl: 'http://x', fetchImpl, readFile: fakeRead, retries: 1 }),
    /boom2/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/stt-client.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/adapters/stt-client.js
import { readFile as fsReadFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { config } from '../config/env.js';

export async function transcribeFile(filePath, opts = {}, deps = {}) {
  const baseUrl = deps.baseUrl || config.sttUrl;
  const fetchImpl = deps.fetchImpl || fetch;
  const readFile = deps.readFile || fsReadFile;
  const retries = deps.retries ?? 1;
  // Generous: one call transcribes a whole speaking turn, which on CPU can take
  // minutes for the larger models. This only fires on a stalled (silent) sidecar;
  // a dead one fails fast with ECONNREFUSED. Tunable via deps.timeoutMs.
  const timeoutMs = deps.timeoutMs ?? 600_000;

  const bytes = await readFile(filePath);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([bytes]), basename(filePath));
      form.append('model', opts.model || 'small');
      form.append('language', opts.language || 'auto');
      const res = await fetchImpl(`${baseUrl}/transcribe`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs),
      });
      // A non-OK HTTP status throws here and is caught below, so it is retried too.
      if (!res.ok) throw new Error(`STT sidecar HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/stt-client.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/stt-client.js test/stt-client.test.js
git commit -m "feat: STT sidecar HTTP client with retry"
```

---

## Task 6: pipeline/summarize.js — pure helpers (merge transcript + talk-time)

**Files:**
- Create: `src/pipeline/summarize.js`
- Test: `test/summarize.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/summarize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranscript, computeTalkTime, formatMs } from '../src/pipeline/summarize.js';

const utterances = [
  { displayName: 'Alice', startMs: 2000, endMs: 4000, text: 'second' },
  { displayName: 'Bob', startMs: 0, endMs: 1000, text: 'first' },
  { displayName: 'Alice', startMs: 5000, endMs: 6000, text: 'third word here' },
];

test('formatMs renders mm:ss', () => {
  assert.equal(formatMs(0), '00:00');
  assert.equal(formatMs(65000), '01:05');
});

test('buildTranscript sorts by startMs and labels speakers', () => {
  const t = buildTranscript(utterances);
  assert.equal(t, '[00:00] Bob: first\n[00:02] Alice: second\n[00:05] Alice: third word here');
});

test('computeTalkTime aggregates ms, words, pct per speaker', () => {
  const stats = computeTalkTime(utterances);
  const alice = stats.find((s) => s.displayName === 'Alice');
  const bob = stats.find((s) => s.displayName === 'Bob');
  assert.equal(alice.ms, 3000);     // (4000-2000)+(6000-5000)
  assert.equal(alice.words, 4);     // "second"(1) + "third word here"(3)
  assert.equal(bob.ms, 1000);
  assert.equal(alice.pct + bob.pct, 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/summarize.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/pipeline/summarize.js
export function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function buildTranscript(utterances) {
  return [...utterances]
    .sort((a, b) => a.startMs - b.startMs)
    .map((u) => `[${formatMs(u.startMs)}] ${u.displayName}: ${u.text}`)
    .join('\n');
}

export function computeTalkTime(utterances) {
  const by = new Map();
  for (const u of utterances) {
    const cur = by.get(u.displayName) || { displayName: u.displayName, ms: 0, words: 0 };
    cur.ms += Math.max(0, u.endMs - u.startMs);
    cur.words += u.text.trim() ? u.text.trim().split(/\s+/).length : 0;
    by.set(u.displayName, cur);
  }
  const stats = [...by.values()];
  const totalMs = stats.reduce((s, x) => s + x.ms, 0) || 1;
  for (const s of stats) s.pct = Math.round((s.ms / totalMs) * 100);
  return stats.sort((a, b) => b.ms - a.ms);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/summarize.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/summarize.js test/summarize.test.js
git commit -m "feat: transcript merge + talk-time computation"
```

---

## Task 7: adapters/summarizer — StructuredNotes, fake adapter, Gemini parse, factory

**Files:**
- Create: `src/adapters/summarizer/notes.js`
- Create: `src/adapters/summarizer/fake.js`
- Create: `src/adapters/summarizer/gemini.js`
- Create: `src/adapters/summarizer/index.js`
- Test: `test/summarizer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/summarizer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNotes, normalizeNotes, SUMMARY_PROMPT } from '../src/adapters/summarizer/notes.js';
import { FakeSummarizer } from '../src/adapters/summarizer/fake.js';
import { parseGeminiNotes } from '../src/adapters/summarizer/gemini.js';
import { getSummarizer } from '../src/adapters/summarizer/index.js';

test('normalizeNotes fills missing fields from empty shape', () => {
  const n = normalizeNotes({ tldr: 'x' });
  assert.equal(n.tldr, 'x');
  assert.deepEqual(n.topics, []);
  assert.deepEqual(n.actionItems, []);
});

test('SUMMARY_PROMPT instructs JSON output with action item assignees', () => {
  assert.match(SUMMARY_PROMPT, /JSON/);
  assert.match(SUMMARY_PROMPT, /assignee/);
});

test('FakeSummarizer returns a valid normalized shape', async () => {
  const out = await new FakeSummarizer().summarize('transcript', { attendees: ['Alice'] });
  assert.equal(typeof out.tldr, 'string');
  assert.ok(Array.isArray(out.actionItems));
});

test('parseGeminiNotes extracts JSON from a fenced code block', () => {
  const raw = 'Here:\n```json\n{"tldr":"hi","actionItems":[{"assignee":"Alice","task":"ship"}]}\n```';
  const n = parseGeminiNotes(raw);
  assert.equal(n.tldr, 'hi');
  assert.equal(n.actionItems[0].assignee, 'Alice');
});

test('parseGeminiNotes falls back to tldr on non-JSON', () => {
  const n = parseGeminiNotes('plain text summary');
  assert.equal(n.tldr, 'plain text summary');
});

test('getSummarizer returns fake when provider is fake', () => {
  const s = getSummarizer({ summarizerProvider: 'fake', summarizerModel: 'x' });
  assert.equal(s.constructor.name, 'FakeSummarizer');
});

test('getSummarizer throws on unknown provider', () => {
  assert.throws(() => getSummarizer({ summarizerProvider: 'nope' }), /Unknown summarizer/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/summarizer.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write `notes.js`**

```js
// src/adapters/summarizer/notes.js
export function emptyNotes() {
  return { tldr: '', topics: [], decisions: [], openQuestions: [], actionItems: [] };
}

export function normalizeNotes(obj = {}) {
  const base = emptyNotes();
  return {
    tldr: typeof obj.tldr === 'string' ? obj.tldr : base.tldr,
    // shallow-copy arrays so the normalized result never shares references with the input
    topics: Array.isArray(obj.topics) ? [...obj.topics] : base.topics,
    decisions: Array.isArray(obj.decisions) ? [...obj.decisions] : base.decisions,
    openQuestions: Array.isArray(obj.openQuestions) ? [...obj.openQuestions] : base.openQuestions,
    actionItems: Array.isArray(obj.actionItems) ? [...obj.actionItems] : base.actionItems,
  };
}

export const SUMMARY_PROMPT = `You are a meeting-notes assistant. Read the speaker-labeled transcript and return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "tldr": "2-4 sentence overview",
  "topics": [{"title": "string", "points": ["string"]}],
  "decisions": ["string"],
  "openQuestions": ["string"],
  "actionItems": [{"assignee": "speaker display name or null", "task": "string"}]
}
Rules:
- Assign each action item to the speaker responsible using their display name; use null only if truly unassigned.
- Use the speaker names exactly as they appear in the transcript.
- If the transcript is short or unclear, still return the JSON with best-effort empty arrays.`;
```

- [ ] **Step 4: Write `fake.js`**

```js
// src/adapters/summarizer/fake.js
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
}
```

- [ ] **Step 5: Write `gemini.js`**

```js
// src/adapters/summarizer/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizeNotes, SUMMARY_PROMPT } from './notes.js';
import { config } from '../../config/env.js';

export function parseGeminiNotes(raw = '') {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : raw;
  try {
    return normalizeNotes(JSON.parse(candidate.trim()));
  } catch {
    const brace = candidate.match(/\{[\s\S]*\}/);
    if (brace) {
      try { return normalizeNotes(JSON.parse(brace[0])); } catch { /* fall through */ }
    }
    return normalizeNotes({ tldr: raw.trim() });
  }
}

export class GeminiSummarizer {
  constructor(model, apiKey = config.gemini.apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env');
    this.model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model });
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}\n\nMeeting: ${meta.channelName || ''} on ${meta.date || ''}\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    const result = await this.model.generateContent(prompt);
    return parseGeminiNotes(result.response.text());
  }
}
```

- [ ] **Step 6: Write `index.js`**

```js
// src/adapters/summarizer/index.js
import { FakeSummarizer } from './fake.js';
import { GeminiSummarizer } from './gemini.js';

export function getSummarizer(cfg) {
  switch (cfg.summarizerProvider) {
    case 'fake': return new FakeSummarizer();
    case 'gemini': return new GeminiSummarizer(cfg.summarizerModel);
    default: throw new Error(`Unknown summarizer provider: ${cfg.summarizerProvider}`);
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test test/summarizer.test.js`
Expected: PASS (7 tests). Gemini constructor is never called in tests (only `parseGeminiNotes` is tested directly).

- [ ] **Step 8: Commit**

```bash
git add src/adapters/summarizer test/summarizer.test.js
git commit -m "feat: summarizer adapters (notes shape, fake, gemini, factory)"
```

---

## Task 8: adapters/summarizer/ollama.js + openai.js + wire into factory

**Files:**
- Create: `src/adapters/summarizer/ollama.js`
- Create: `src/adapters/summarizer/openai.js`
- Modify: `src/adapters/summarizer/index.js`
- Test: `test/summarizer-http.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/summarizer-http.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaSummarizer } from '../src/adapters/summarizer/ollama.js';
import { OpenAISummarizer } from '../src/adapters/summarizer/openai.js';
import { getSummarizer } from '../src/adapters/summarizer/index.js';

const okJson = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test('OllamaSummarizer parses message content JSON', async () => {
  const fetchImpl = okJson({ message: { content: '{"tldr":"o","actionItems":[]}' } });
  const s = new OllamaSummarizer('qwen', 'http://x', fetchImpl);
  const out = await s.summarize('t', { attendees: [] });
  assert.equal(out.tldr, 'o');
});

test('OpenAISummarizer parses choices[0].message.content JSON', async () => {
  const fetchImpl = okJson({ choices: [{ message: { content: '{"tldr":"oa","actionItems":[]}' } }] });
  const s = new OpenAISummarizer('gpt-x', 'http://x', 'key', fetchImpl);
  const out = await s.summarize('t', { attendees: [] });
  assert.equal(out.tldr, 'oa');
});

test('getSummarizer builds ollama + openai providers', () => {
  assert.equal(getSummarizer({ summarizerProvider: 'ollama', summarizerModel: 'qwen' }).constructor.name, 'OllamaSummarizer');
  assert.equal(
    getSummarizer({ summarizerProvider: 'openai', summarizerModel: 'gpt-x' }, { openai: { apiKey: 'k', baseUrl: 'http://x' } }).constructor.name,
    'OpenAISummarizer'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/summarizer-http.test.js`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Write `ollama.js`**

```js
// src/adapters/summarizer/ollama.js
import { parseGeminiNotes } from './gemini.js';
import { SUMMARY_PROMPT } from './notes.js';
import { config } from '../../config/env.js';

export class OllamaSummarizer {
  constructor(model, url = config.ollama.url, fetchImpl = fetch) {
    this.model = model; this.url = url; this.fetchImpl = fetchImpl;
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    const res = await this.fetchImpl(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, stream: false, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const body = await res.json();
    return parseGeminiNotes(body.message?.content ?? '');
  }
}
```

- [ ] **Step 4: Write `openai.js`**

```js
// src/adapters/summarizer/openai.js
import { parseGeminiNotes } from './gemini.js';
import { SUMMARY_PROMPT } from './notes.js';
import { config } from '../../config/env.js';

export class OpenAISummarizer {
  constructor(model, baseUrl = config.openai.baseUrl, apiKey = config.openai.apiKey, fetchImpl = fetch) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env');
    this.model = model; this.baseUrl = baseUrl; this.apiKey = apiKey; this.fetchImpl = fetchImpl;
  }
  async summarize(transcript, meta) {
    const prompt = `${SUMMARY_PROMPT}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const body = await res.json();
    return parseGeminiNotes(body.choices?.[0]?.message?.content ?? '');
  }
}
```

- [ ] **Step 5: Update `index.js`**

```js
// src/adapters/summarizer/index.js
import { FakeSummarizer } from './fake.js';
import { GeminiSummarizer } from './gemini.js';
import { OllamaSummarizer } from './ollama.js';
import { OpenAISummarizer } from './openai.js';
import { config as envConfig } from '../../config/env.js';

export function getSummarizer(cfg, env = envConfig) {
  switch (cfg.summarizerProvider) {
    case 'fake': return new FakeSummarizer();
    case 'gemini': return new GeminiSummarizer(cfg.summarizerModel, env.gemini.apiKey);
    case 'ollama': return new OllamaSummarizer(cfg.summarizerModel, env.ollama.url);
    case 'openai': return new OpenAISummarizer(cfg.summarizerModel, env.openai.baseUrl, env.openai.apiKey);
    default: throw new Error(`Unknown summarizer provider: ${cfg.summarizerProvider}`);
  }
}

export const SUPPORTED_PROVIDERS = ['gemini', 'ollama', 'openai'];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/summarizer-http.test.js test/summarizer.test.js`
Expected: PASS. Note: GeminiSummarizer now takes apiKey as 2nd arg — consistent with Task 7's constructor `(model, apiKey)`.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/summarizer test/summarizer-http.test.js
git commit -m "feat: ollama + openai summarizer adapters"
```

---

## Task 9: delivery/discord-notes.js — format StructuredNotes to Discord markdown (chunked)

**Files:**
- Create: `src/delivery/discord-notes.js`
- Test: `test/discord-notes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/discord-notes.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/discord-notes.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/delivery/discord-notes.js
export function groupActionItems(actionItems) {
  const g = new Map();
  for (const item of actionItems) {
    const key = item.assignee || 'Unassigned';
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(item.task);
  }
  return g;
}

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/discord-notes.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/delivery/discord-notes.js test/discord-notes.test.js
git commit -m "feat: render StructuredNotes to chunked Discord markdown"
```

---

## Task 10: voice/audio.js — PCM filename + ffmpeg PCM→WAV

**Files:**
- Create: `src/voice/audio.js`
- Test: `test/audio.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/audio.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmName, parsePcmName, pcmToWavArgs } from '../src/voice/audio.js';

test('pcmName + parsePcmName roundtrip (userId may contain no underscores)', () => {
  const name = pcmName('123', 4567);
  assert.equal(name, '123_4567.pcm');
  assert.deepEqual(parsePcmName(name), { userId: '123', startMs: 4567 });
});

test('pcmToWavArgs builds 16k mono s16 ffmpeg args', () => {
  const args = pcmToWavArgs('/in.pcm', '/out.wav');
  assert.deepEqual(args, [
    '-y', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', '/in.pcm',
    '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '/out.wav',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/audio.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/voice/audio.js
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

// Filenames live under audio/<meetingId>/, so userId+startMs is enough and avoids
// the underscore-in-channel-name parsing bug of the old implementation.
export function pcmName(userId, startMs) {
  return `${userId}_${startMs}.pcm`;
}

export function parsePcmName(name) {
  const base = name.replace(/\.pcm$/, '');
  const idx = base.lastIndexOf('_');
  return { userId: base.slice(0, idx), startMs: Number(base.slice(idx + 1)) };
}

export function pcmToWavArgs(pcmPath, wavPath) {
  return ['-y', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', pcmPath,
          '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', wavPath];
}

export function convertPcmToWav(pcmPath, wavPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, pcmToWavArgs(pcmPath, wavPath));
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => code === 0 ? resolve(wavPath) : reject(new Error(`ffmpeg ${code}: ${err}`)));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/audio.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voice/audio.js test/audio.test.js
git commit -m "feat: PCM filename helpers + ffmpeg PCM->WAV"
```

---

## Task 11: pipeline/transcribe.js — per-track transcription to utterances

**Files:**
- Create: `src/pipeline/transcribe.js`
- Test: `test/transcribe.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/transcribe.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeTracks } from '../src/pipeline/transcribe.js';

test('transcribeTracks maps each track to a labeled utterance', async () => {
  const tracks = [
    { userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' },
    { userId: 'u2', displayName: 'Bob', startMs: 2000, pcmPath: '/b.pcm' },
  ];
  const deps = {
    convert: async (pcm, wav) => wav,
    stt: async (wav) => ({ text: wav.includes('a') ? 'hello' : 'hi', words: [{ start: 0, end: 1 }] }),
    cleanup: () => {},
  };
  const utts = await transcribeTracks(tracks, { whisperModel: 'small', language: 'auto' }, deps);
  assert.equal(utts.length, 2);
  assert.equal(utts[0].displayName, 'Alice');
  assert.equal(utts[0].text, 'hello');
  assert.equal(utts[0].startMs, 0);
});

test('transcribeTracks skips empty transcripts', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' }];
  const deps = { convert: async (p, w) => w, stt: async () => ({ text: '   ', words: [] }), cleanup: () => {} };
  const utts = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts.length, 0);
});

test('transcribeTracks computes endMs from last word timestamp', async () => {
  const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 1000, pcmPath: '/a.pcm' }];
  const deps = { convert: async (p, w) => w, stt: async () => ({ text: 'hi there', words: [{ start: 0, end: 0.5 }, { start: 0.6, end: 2.0 }] }), cleanup: () => {} };
  const utts = await transcribeTracks(tracks, {}, deps);
  assert.equal(utts[0].endMs, 1000 + 2000); // startMs + last word end (2.0s)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transcribe.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/pipeline/transcribe.js
import { convertPcmToWav } from '../voice/audio.js';
import { transcribeFile } from '../adapters/stt-client.js';
import { unlink } from 'node:fs/promises';

export async function transcribeTracks(tracks, cfg = {}, deps = {}) {
  const convert = deps.convert || convertPcmToWav;
  const stt = deps.stt || ((wav) => transcribeFile(wav, { model: cfg.whisperModel, language: cfg.language }));
  const cleanup = deps.cleanup || (async (p) => { try { await unlink(p); } catch { /* ignore */ } });

  const utterances = [];
  for (const t of tracks) {
    const wavPath = t.pcmPath.replace(/\.pcm$/, '.wav');
    try {
      await convert(t.pcmPath, wavPath);
      const { text, words } = await stt(wavPath, cfg);
      const clean = (text || '').trim();
      if (!clean) continue;
      const lastEnd = words && words.length ? words[words.length - 1].end : 0;
      utterances.push({
        userId: t.userId,
        displayName: t.displayName,
        startMs: t.startMs,
        endMs: t.startMs + Math.round(lastEnd * 1000),
        text: clean,
      });
    } finally {
      await cleanup(wavPath);
    }
  }
  return utterances;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transcribe.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/transcribe.js test/transcribe.test.js
git commit -m "feat: transcribe per-speaker tracks into utterances"
```

---

## Task 12: pipeline/orchestrator.js — drive finalize → store → notes, with status transitions

**Files:**
- Create: `src/pipeline/orchestrator.js`
- Test: `test/orchestrator.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/orchestrator.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { processMeeting } from '../src/pipeline/orchestrator.js';
import { FakeSummarizer } from '../src/adapters/summarizer/fake.js';

function seed() {
  const db = openDb(':memory:');
  const id = db.createMeeting({ guildId: 'g', channelId: 'c', channelName: 'general', startedAt: 't' });
  db.addAttendee(id, 'u1', 'Alice');
  return { db, id };
}

const tracks = [{ userId: 'u1', displayName: 'Alice', startMs: 0, pcmPath: '/a.pcm' }];

test('processMeeting transcribes, summarizes, stores, sets done, delivers', async () => {
  const { db, id } = seed();
  let delivered = null;
  await processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake', whisperModel: 'small', language: 'auto' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hello team' }],
    deliver: async (notes, talktime) => { delivered = { notes, talktime }; },
  });
  assert.equal(db.getMeeting(id).status, 'done');
  assert.equal(db.listUtterances(id).length, 1);
  assert.ok(db.getSummary(id));
  assert.ok(delivered.notes.tldr);
  assert.equal(delivered.talktime[0].displayName, 'Alice');
});

test('processMeeting marks transcription_failed and rethrows on STT error', async () => {
  const { db, id } = seed();
  await assert.rejects(processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: new FakeSummarizer(),
    transcribe: async () => { throw new Error('sidecar down'); },
    deliver: async () => {},
  }), /sidecar down/);
  assert.equal(db.getMeeting(id).status, 'transcription_failed');
});

test('processMeeting marks summary_failed when summarizer throws', async () => {
  const { db, id } = seed();
  const boom = { summarize: async () => { throw new Error('429'); } };
  await assert.rejects(processMeeting(db, id, {
    tracks,
    cfg: { summarizerProvider: 'fake' },
    summarizer: boom,
    transcribe: async () => [{ userId: 'u1', displayName: 'Alice', startMs: 0, endMs: 1000, text: 'hi' }],
    deliver: async () => {},
  }), /429/);
  assert.equal(db.getMeeting(id).status, 'summary_failed');
  assert.equal(db.listUtterances(id).length, 1); // transcript still saved
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/orchestrator.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/pipeline/orchestrator.js
import { transcribeTracks } from './transcribe.js';
import { buildTranscript, computeTalkTime } from './summarize.js';
import { getSummarizer } from '../adapters/summarizer/index.js';

export async function processMeeting(db, meetingId, opts) {
  const meeting = db.getMeeting(meetingId);
  const transcribe = opts.transcribe || ((tracks, cfg) => transcribeTracks(tracks, cfg));
  const summarizer = opts.summarizer || getSummarizer(opts.cfg);

  db.setMeetingStatus(meetingId, 'processing');

  let utterances;
  try {
    utterances = await transcribe(opts.tracks, opts.cfg);
  } catch (err) {
    db.setMeetingStatus(meetingId, 'transcription_failed');
    throw err;
  }
  for (const u of utterances) db.addUtterance({ meetingId, ...u });

  const transcript = buildTranscript(utterances);
  const talktime = computeTalkTime(utterances);
  const attendees = db.listAttendees(meetingId).map((a) => a.display_name);
  const meta = { channelName: meeting.channel_name, date: meeting.started_at, attendees };

  let notes;
  try {
    notes = await summarizer.summarize(transcript, meta);
  } catch (err) {
    db.setMeetingStatus(meetingId, 'summary_failed');
    throw err;
  }

  const modelUsed = `${opts.cfg.summarizerProvider}:${opts.cfg.summarizerModel || ''}`;
  db.saveSummary(meetingId, notes, talktime, modelUsed);
  db.setMeetingStatus(meetingId, 'done', new Date().toISOString());

  if (opts.deliver) await opts.deliver(notes, talktime, meta);
  return { notes, talktime };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/orchestrator.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/orchestrator.js test/orchestrator.test.js
git commit -m "feat: meeting orchestrator with status transitions + failure handling"
```

---

## Task 13: voice/decisions.js — pure auto-join/leave logic

**Files:**
- Create: `src/voice/decisions.js`
- Test: `test/decisions.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/decisions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoJoin, shouldAutoLeave } from '../src/voice/decisions.js';

test('shouldAutoJoin true when >1 human and autoJoin enabled and not connected', () => {
  assert.equal(shouldAutoJoin({ humanCount: 2, autoJoin: true, connected: false }), true);
});

test('shouldAutoJoin false when autoJoin disabled', () => {
  assert.equal(shouldAutoJoin({ humanCount: 5, autoJoin: false, connected: false }), false);
});

test('shouldAutoJoin false when already connected', () => {
  assert.equal(shouldAutoJoin({ humanCount: 5, autoJoin: true, connected: true }), false);
});

test('shouldAutoJoin false when <=1 human', () => {
  assert.equal(shouldAutoJoin({ humanCount: 1, autoJoin: true, connected: false }), false);
});

test('shouldAutoLeave true when connected and <=1 human', () => {
  assert.equal(shouldAutoLeave({ humanCount: 1, connected: true }), true);
  assert.equal(shouldAutoLeave({ humanCount: 2, connected: true }), false);
  assert.equal(shouldAutoLeave({ humanCount: 0, connected: false }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/decisions.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/voice/decisions.js
export function shouldAutoJoin({ humanCount, autoJoin, connected }) {
  return !!autoJoin && !connected && humanCount > 1;
}

export function shouldAutoLeave({ humanCount, connected }) {
  return !!connected && humanCount <= 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/decisions.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voice/decisions.js test/decisions.test.js
git commit -m "feat: pure auto-join/leave decision logic"
```

---

## Task 14: voice/capture.js — per-user PCM capture (integration glue)

**Files:**
- Create: `src/voice/capture.js`
- Test: `test/capture.test.js` (tests the pure track-bookkeeping; the discord.js stream wiring is covered by the manual checklist)

- [ ] **Step 1: Write the failing test**

```js
// test/capture.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackRegistry } from '../src/voice/capture.js';

test('TrackRegistry records and lists finished tracks', () => {
  const reg = new TrackRegistry();
  reg.begin('u1', 'Alice', 1000, '/audio/1/u1_1000.pcm');
  reg.begin('u2', 'Bob', 1500, '/audio/1/u2_1500.pcm');
  reg.finish('u1');
  reg.finish('u2');
  const tracks = reg.list();
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map((t) => t.displayName).sort(), ['Alice', 'Bob']);
  assert.equal(tracks[0].pcmPath.endsWith('.pcm'), true);
});

test('TrackRegistry isActive prevents duplicate begin', () => {
  const reg = new TrackRegistry();
  reg.begin('u1', 'Alice', 1000, '/p.pcm');
  assert.equal(reg.isActive('u1'), true);
  assert.equal(reg.isActive('u2'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/capture.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/voice/capture.js
import { createWriteStream, mkdirSync } from 'node:fs';
import prism from 'prism-media';
import { EndBehaviorType } from '@discordjs/voice';
import { pcmName } from './audio.js';

// Pure bookkeeping of per-user tracks for a single meeting; unit-testable.
export class TrackRegistry {
  constructor() { this.active = new Map(); this.done = []; }
  isActive(userId) { return this.active.has(userId); }
  begin(userId, displayName, startMs, pcmPath, handles = {}) {
    this.active.set(userId, { userId, displayName, startMs, pcmPath, ...handles });
  }
  finish(userId) {
    const t = this.active.get(userId);
    if (!t) return null;
    this.active.delete(userId);
    this.done.push({ userId: t.userId, displayName: t.displayName, startMs: t.startMs, pcmPath: t.pcmPath });
    return t;
  }
  list() { return [...this.done]; }
}

// Side-effecting wiring used by MeetingManager. Not unit-tested (needs a live
// voice connection); validated by the manual integration checklist.
export function attachCapture({ connection, guild, audioDir, registry, now = () => Date.now() }) {
  mkdirSync(audioDir, { recursive: true });
  connection.receiver.speaking.on('start', (userId) => {
    if (registry.isActive(userId)) return;
    const member = guild.members.cache.get(userId);
    if (!member || member.user.bot) return;

    const startMs = now();
    const pcmPath = `${audioDir}/${pcmName(userId, startMs)}`;

    const opusStream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 } });
    const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 320 });
    const out = createWriteStream(pcmPath);
    opusStream.pipe(decoder).pipe(out);

    const end = () => {
      try { out.end(); } catch { /* ignore */ }
      try { decoder.destroy(); } catch { /* ignore */ }
      try { opusStream.destroy(); } catch { /* ignore */ }
      registry.finish(userId);
    };

    registry.begin(userId, member.displayName, startMs, pcmPath, { opusStream, decoder, out, end });

    opusStream.on('end', end);
    opusStream.on('error', end);
    decoder.on('error', end);
  });

  return {
    // End every still-active speaking turn and wait for its PCM to flush, so a
    // manual /leave or auto-leave never loses the final in-flight utterance.
    async stopAll() {
      const actives = [...registry.active.values()];
      await Promise.all(actives.map((t) => new Promise((resolve) => {
        if (t.out.writableFinished) { resolve(); return; }
        t.out.once('finish', resolve);
        t.out.once('close', resolve);
        t.end();
      })));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/capture.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voice/capture.js test/capture.test.js
git commit -m "feat: per-user voice capture + track registry"
```

---

## Task 15: voice/meeting-manager.js — lifecycle + concurrency

**Files:**
- Create: `src/voice/meeting-manager.js`
- Test: `test/meeting-manager.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/meeting-manager.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/store/db.js';
import { MeetingManager } from '../src/voice/meeting-manager.js';

function makeManager() {
  const db = openDb(':memory:');
  const started = [];
  const mgr = new MeetingManager({
    db,
    audioRoot: '/tmp/audio',
    // injected side-effect doubles
    startCapture: (ctx) => { started.push(ctx.meetingId); return { registry: { list: () => [] } }; },
    finalize: async () => {},
    now: () => '2026-06-04T10:00:00Z',
  });
  return { db, mgr, started };
}

test('start creates a meeting row, records attendees, tracks active key', () => {
  const { db, mgr } = makeManager();
  const id = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'general', connection: {}, guild: {}, attendees: [{ id: 'u1', displayName: 'Alice' }] });
  assert.equal(db.getMeeting(id).status, 'recording');
  assert.deepEqual(db.listAttendees(id).map((a) => a.display_name), ['Alice']);
  assert.equal(mgr.isActive('g', 'c'), true);
});

test('start is idempotent per guild+channel', () => {
  const { mgr } = makeManager();
  const a = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  const b = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  assert.equal(a, b);
});

test('two channels record concurrently', () => {
  const { mgr } = makeManager();
  mgr.start({ guildId: 'g', channelId: 'c1', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  mgr.start({ guildId: 'g', channelId: 'c2', channelName: 'y', connection: {}, guild: {}, attendees: [] });
  assert.equal(mgr.isActive('g', 'c1'), true);
  assert.equal(mgr.isActive('g', 'c2'), true);
});

test('stop finalizes and clears the active key', async () => {
  const { db, mgr } = makeManager();
  const id = mgr.start({ guildId: 'g', channelId: 'c', channelName: 'x', connection: {}, guild: {}, attendees: [] });
  await mgr.stop('g', 'c');
  assert.equal(mgr.isActive('g', 'c'), false);
  // finalize double is a no-op, so status stays 'recording' here; real finalize sets terminal status.
  assert.ok(db.getMeeting(id));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/meeting-manager.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/voice/meeting-manager.js
export class MeetingManager {
  constructor({ db, audioRoot, startCapture, finalize, now = () => new Date().toISOString() }) {
    this.db = db;
    this.audioRoot = audioRoot;
    this.startCapture = startCapture;     // (ctx) -> { registry }
    this.finalize = finalize;             // async (meetingId, tracks, ctx) -> void
    this.now = now;
    this.active = new Map();              // key "guild:channel" -> session
  }

  key(guildId, channelId) { return `${guildId}:${channelId}`; }
  isActive(guildId, channelId) { return this.active.has(this.key(guildId, channelId)); }

  start({ guildId, channelId, channelName, connection, guild, attendees }) {
    const k = this.key(guildId, channelId);
    if (this.active.has(k)) return this.active.get(k).meetingId;

    const meetingId = this.db.createMeeting({ guildId, channelId, channelName, startedAt: this.now() });
    for (const a of attendees || []) this.db.addAttendee(meetingId, a.id, a.displayName);

    const audioDir = `${this.audioRoot}/${meetingId}`;
    const { registry, stopAll } = this.startCapture({ meetingId, connection, guild, audioDir });
    this.active.set(k, { meetingId, connection, guild, registry, stopAll, audioDir });
    return meetingId;
  }

  async stop(guildId, channelId) {
    const k = this.key(guildId, channelId);
    const session = this.active.get(k);
    if (!session) return null;
    this.active.delete(k);
    if (session.stopAll) await session.stopAll();  // flush in-flight speaking turns before harvesting tracks
    const tracks = session.registry.list();
    await this.finalize(session.meetingId, tracks, session);
    return session.meetingId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/meeting-manager.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/voice/meeting-manager.js test/meeting-manager.test.js
git commit -m "feat: per-guild+channel meeting lifecycle manager"
```

---

## Task 16: commands/setup.js — /setup option validation (pure)

**Files:**
- Create: `src/commands/setup-logic.js`
- Test: `test/setup-logic.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/setup-logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSetup } from '../src/commands/setup-logic.js';

const env = { gemini: { apiKey: 'g' }, openai: { apiKey: '' }, ollama: { url: 'http://x' } };

test('accepts gemini when key present', () => {
  const r = validateSetup({ provider: 'gemini', model: 'gemini-2.5-flash' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.summarizerProvider, 'gemini');
});

test('rejects openai when key missing', () => {
  const r = validateSetup({ provider: 'openai', model: 'gpt-x' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /OPENAI_API_KEY/);
});

test('rejects unknown provider', () => {
  const r = validateSetup({ provider: 'bogus' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /provider/i);
});

test('accepts whisper model + thread + autojoin booleans', () => {
  const r = validateSetup({ whisperModel: 'medium', useThread: false, autoJoin: true }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.whisperModel, 'medium');
  assert.equal(r.patch.useThread, false);
});

test('rejects invalid whisper model', () => {
  const r = validateSetup({ whisperModel: 'humongous' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /whisper/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/setup-logic.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/commands/setup-logic.js
import { SUPPORTED_PROVIDERS } from '../adapters/summarizer/index.js';

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'];

function providerKeyPresent(provider, env) {
  if (provider === 'gemini') return { ok: !!env.gemini.apiKey, missing: 'GEMINI_API_KEY' };
  if (provider === 'openai') return { ok: !!env.openai.apiKey, missing: 'OPENAI_API_KEY' };
  if (provider === 'ollama') return { ok: !!env.ollama.url, missing: 'OLLAMA_URL' };
  return { ok: false, missing: null };
}

export function validateSetup(input, env) {
  const patch = {};

  if (input.provider !== undefined) {
    if (!SUPPORTED_PROVIDERS.includes(input.provider)) {
      return { ok: false, error: `Unknown provider "${input.provider}". Use one of: ${SUPPORTED_PROVIDERS.join(', ')}.` };
    }
    const key = providerKeyPresent(input.provider, env);
    if (!key.ok) return { ok: false, error: `Cannot use ${input.provider}: ${key.missing} is not set in .env.` };
    patch.summarizerProvider = input.provider;
    if (input.model) patch.summarizerModel = input.model;
  }

  if (input.whisperModel !== undefined) {
    if (!WHISPER_MODELS.includes(input.whisperModel)) {
      return { ok: false, error: `Invalid whisper model. Use one of: ${WHISPER_MODELS.join(', ')}.` };
    }
    patch.whisperModel = input.whisperModel;
  }

  if (input.notesChannelId !== undefined) patch.notesChannelId = input.notesChannelId;
  if (input.useThread !== undefined) patch.useThread = !!input.useThread;
  if (input.autoJoin !== undefined) patch.autoJoin = !!input.autoJoin;
  if (input.language !== undefined) patch.language = input.language;

  return { ok: true, patch };
}

export { WHISPER_MODELS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/setup-logic.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup-logic.js test/setup-logic.test.js
git commit -m "feat: /setup option validation logic"
```

---

## Task 17: commands/definitions.js — slash command JSON + deploy

**Files:**
- Create: `src/commands/definitions.js`
- Create: `src/commands/deploy.js`
- Test: `test/definitions.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/definitions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsJSON } from '../src/commands/definitions.js';

test('exports the six v1 commands as JSON', () => {
  const names = commandsJSON().map((c) => c.name).sort();
  assert.deepEqual(names, ['history', 'join', 'leave', 'search', 'setup', 'summary']);
});

test('search command has a required keyword option', () => {
  const search = commandsJSON().find((c) => c.name === 'search');
  const opt = search.options.find((o) => o.name === 'keyword');
  assert.equal(opt.required, true);
});

test('setup command exposes provider/model/whisper/thread/autojoin/channel/language options', () => {
  const setup = commandsJSON().find((c) => c.name === 'setup');
  const names = setup.options.map((o) => o.name).sort();
  assert.deepEqual(names, ['autojoin', 'language', 'model', 'notes_channel', 'provider', 'thread', 'whisper_model']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/definitions.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `definitions.js`**

```js
// src/commands/definitions.js
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { SUPPORTED_PROVIDERS } from '../adapters/summarizer/index.js';
import { WHISPER_MODELS } from './setup-logic.js';

export function buildCommands() {
  return [
    new SlashCommandBuilder().setName('join').setDescription('Join your voice channel and start recording'),
    new SlashCommandBuilder().setName('leave').setDescription('Stop recording and leave'),
    new SlashCommandBuilder().setName('summary').setDescription('Show notes for a meeting')
      .addIntegerOption((o) => o.setName('meeting').setDescription('Meeting id (default: most recent)')),
    new SlashCommandBuilder().setName('history').setDescription('List recent meetings'),
    new SlashCommandBuilder().setName('search').setDescription('Search past meetings')
      .addStringOption((o) => o.setName('keyword').setDescription('Word or phrase').setRequired(true)),
    new SlashCommandBuilder().setName('setup').setDescription('Configure the bot (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName('provider').setDescription('Summarizer provider')
        .addChoices(...SUPPORTED_PROVIDERS.map((p) => ({ name: p, value: p }))))
      .addStringOption((o) => o.setName('model').setDescription('Summarizer model name'))
      .addStringOption((o) => o.setName('whisper_model').setDescription('Whisper model size')
        .addChoices(...WHISPER_MODELS.map((m) => ({ name: m, value: m }))))
      .addChannelOption((o) => o.setName('notes_channel').setDescription('Where to post notes').addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('thread').setDescription('Post notes in a thread'))
      .addBooleanOption((o) => o.setName('autojoin').setDescription('Auto-join when 2+ people are in voice'))
      .addStringOption((o) => o.setName('language').setDescription('Language code or "auto"')),
  ];
}

export function commandsJSON() {
  return buildCommands().map((c) => c.toJSON());
}
```

- [ ] **Step 4: Write `deploy.js`**

```js
// src/commands/deploy.js
import { REST, Routes } from 'discord.js';
import { commandsJSON } from './definitions.js';
import { config } from '../config/env.js';

export async function deployCommands(clientId = config.discordClientId, token = config.discordToken) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commandsJSON() });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/definitions.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/commands/definitions.js src/commands/deploy.js test/definitions.test.js
git commit -m "feat: slash command definitions + deploy"
```

---

## Task 18: index.js — entrypoint wiring (Discord events + boot recovery)

**Files:**
- Create: `src/index.js`
- Create: `src/delivery/post.js` (thread/channel posting glue)
- Manual verification only (no unit test — this is the integration shell).

- [ ] **Step 1: Write `src/delivery/post.js`**

```js
// src/delivery/post.js
import { ChannelType } from 'discord.js';
import { renderNotes, chunk } from './discord-notes.js';

export async function postNotes({ client, meeting, cfg, notes, talktime }) {
  const channelId = cfg.notesChannelId || meeting.channel_id;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const md = renderNotes(notes, talktime, { channelName: meeting.channel_name, date: meeting.started_at });
  const parts = chunk(md);

  let target = channel;
  if (cfg.useThread && channel.type === ChannelType.GuildText) {
    // Fall back to the channel itself if thread creation fails (e.g. missing perms)
    // so the notes are never silently lost.
    target = await channel.threads
      .create({ name: `Notes — ${meeting.channel_name} ${meeting.started_at.slice(0, 10)}` })
      .catch(() => channel);
  }
  for (const part of parts) await target.send(part);
}
```

- [ ] **Step 2: Write `src/index.js`**

```js
// src/index.js
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { config, validateEnv } from './config/env.js';
import { openDb } from './store/db.js';
import { getGuildConfig, setGuildConfig } from './store/config.js';
import { deployCommands } from './commands/deploy.js';
import { MeetingManager } from './voice/meeting-manager.js';
import { TrackRegistry, attachCapture } from './voice/capture.js';
import { processMeeting } from './pipeline/orchestrator.js';
import { getSummarizer } from './adapters/summarizer/index.js';
import { shouldAutoJoin, shouldAutoLeave } from './voice/decisions.js';
import { validateSetup } from './commands/setup-logic.js';
import { renderNotes, chunk } from './delivery/discord-notes.js';
import { postNotes } from './delivery/post.js';

validateEnv();
const db = openDb(join(config.dataDir, 'meetings.db'));
const audioRoot = join(config.dataDir, 'audio');

const client = new Client({
  // Minimal set: Guilds (slash commands + channel cache), GuildVoiceStates
  // (voiceStateUpdate + channel.members). No messageCreate handler, so the
  // privileged MessageContent intent is deliberately NOT requested (requesting
  // it unenabled fails login with 4014).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const manager = new MeetingManager({
  db, audioRoot,
  startCapture: ({ meetingId, connection, guild, audioDir }) => {
    const registry = new TrackRegistry();
    const { stopAll } = attachCapture({ connection, guild, audioDir, registry });
    return { registry, stopAll };
  },
  finalize: async (meetingId, tracks, session) => {
    const meeting = db.getMeeting(meetingId);
    const cfg = getGuildConfig(db, meeting.guild_id);
    try {
      await processMeeting(db, meetingId, {
        tracks,
        cfg,
        summarizer: getSummarizer(cfg),
        deliver: async (notes, talktime) => postNotes({ client, meeting, cfg, notes, talktime }),
      });
      // Success: delete the meeting's audio. On failure we keep the PCM for manual retry.
      await rm(session.audioDir, { recursive: true, force: true }).catch(() => {});
    } catch (err) {
      console.error(`Meeting ${meetingId} failed:`, err.message);
      const ch = await client.channels.fetch(cfg.notesChannelId || meeting.channel_id).catch(() => null);
      if (ch) await ch.send(`⚠️ Meeting ${meetingId} processing failed (${db.getMeeting(meetingId).status}). Transcript is saved if available.`).catch(() => {});
    }
  },
});

function humanCount(channel) {
  return channel.members.filter((m) => !m.user.bot).size;
}
function setRecIndicator(guild, on) {
  guild.members.me?.setNickname(on ? '[REC] Meeting Bot' : null).catch(() => {});
}
async function joinAndStart(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id, guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false, selfMute: true,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  // A concurrent voiceStateUpdate may have started recording this channel while
  // we awaited the connection — bail and drop the redundant connection.
  if (manager.isActive(channel.guild.id, channel.id)) { connection.destroy(); return; }
  const attendees = channel.members.filter((m) => !m.user.bot).map((m) => ({ id: m.id, displayName: m.displayName }));
  manager.start({ guildId: channel.guild.id, channelId: channel.id, channelName: channel.name, connection, guild: channel.guild, attendees });
  setRecIndicator(channel.guild, true);
}
async function stopAndLeave(guildId, channelId) {
  await manager.stop(guildId, channelId);
  const conn = getVoiceConnection(guildId);
  if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) conn.destroy();
  const guild = client.guilds.cache.get(guildId);
  if (guild) setRecIndicator(guild, false);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await deployCommands();
  // Boot recovery: mark orphaned meetings failed (audio from a previous process is unreliable to resume mid-capture).
  for (const m of db.findOrphanedMeetings()) {
    db.setMeetingStatus(m.id, 'transcription_failed');
    console.warn(`Orphaned meeting ${m.id} marked transcription_failed on boot.`);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  const channel = newState.channel || oldState.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  const cfg = getGuildConfig(db, guild.id);
  const connected = manager.isActive(guild.id, channel.id);
  const count = humanCount(channel);

  if (shouldAutoJoin({ humanCount: count, autoJoin: cfg.autoJoin, connected })) {
    await joinAndStart(channel).catch((e) => console.error('auto-join failed:', e.message));
  } else if (shouldAutoLeave({ humanCount: count, connected })) {
    await stopAndLeave(guild.id, channel.id).catch((e) => console.error('auto-leave failed:', e.message));
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member } = interaction;
  try {
    if (commandName === 'join') {
      const vc = member.voice?.channel;
      if (!vc) return interaction.reply({ content: '❌ Join a voice channel first.', ephemeral: true });
      if (manager.isActive(guild.id, vc.id)) return interaction.reply({ content: '✅ Already recording this channel.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await joinAndStart(vc);
      return interaction.editReply('✅ Recording started.');
    }
    if (commandName === 'leave') {
      const vc = member.voice?.channel;
      const channelId = vc?.id;
      if (!channelId || !manager.isActive(guild.id, channelId)) return interaction.reply({ content: "❌ I'm not recording here.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await stopAndLeave(guild.id, channelId);
      return interaction.editReply('✅ Stopped. Notes will post shortly.');
    }
    if (commandName === 'summary') {
      const id = interaction.options.getInteger('meeting') ?? db.listRecent(guild.id, 1)[0]?.id;
      const s = id ? db.getSummary(id) : null;
      if (!s) return interaction.reply({ content: '❌ No summary found.', ephemeral: true });
      const m = db.getMeeting(id);
      const parts = chunk(renderNotes(s.notes, s.talktime, { channelName: m.channel_name, date: m.started_at }));
      await interaction.reply({ content: parts[0], ephemeral: true });
      for (const p of parts.slice(1)) await interaction.followUp({ content: p, ephemeral: true });
      return;
    }
    if (commandName === 'history') {
      const rows = db.listRecent(guild.id, 10);
      const text = rows.length ? rows.map((m) => `#${m.id} • ${m.channel_name} • ${m.started_at} • ${m.status}`).join('\n') : 'No meetings yet.';
      return interaction.reply({ content: text, ephemeral: true });
    }
    if (commandName === 'search') {
      const kw = interaction.options.getString('keyword');
      const hits = db.searchUtterances(guild.id, kw);
      if (!hits.length) return interaction.reply({ content: `No matches for "${kw}".`, ephemeral: true });
      const text = hits.slice(0, 10).map((h) => `#${h.meeting_id} ${h.display_name}: ${h.text}`).join('\n');
      return interaction.reply({ content: chunk(text)[0], ephemeral: true });
    }
    if (commandName === 'setup') {
      const input = {
        provider: interaction.options.getString('provider') ?? undefined,
        model: interaction.options.getString('model') ?? undefined,
        whisperModel: interaction.options.getString('whisper_model') ?? undefined,
        notesChannelId: interaction.options.getChannel('notes_channel')?.id,
        useThread: interaction.options.getBoolean('thread') ?? undefined,
        autoJoin: interaction.options.getBoolean('autojoin') ?? undefined,
        language: interaction.options.getString('language') ?? undefined,
      };
      const result = validateSetup(input, config);
      if (!result.ok) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      const merged = setGuildConfig(db, guild.id, result.patch);
      return interaction.reply({ content: `✅ Config updated:\n\`\`\`json\n${JSON.stringify(merged, null, 2)}\n\`\`\``, ephemeral: true });
    }
  } catch (err) {
    console.error('interaction error:', err);
    const msg = `❌ Error: ${err.message}`;
    if (interaction.deferred || interaction.replied) interaction.editReply(msg).catch(() => {});
    else interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.login(config.discordToken);
```

- [ ] **Step 3: Verify the whole suite still passes**

Run: `node --test`
Expected: PASS (all prior tests; index.js has no tests but must not break imports — a syntax/import error would surface other failures). Also run `node --check src/index.js` → no output (valid syntax).

- [ ] **Step 4: Commit**

```bash
git add src/index.js src/delivery/post.js
git commit -m "feat: bot entrypoint wiring, commands, auto-join/leave, boot recovery"
```

---

## Task 19: Remove old implementation + update docs

**Files:**
- Delete: `bot.js`, `processor.js`, `scheduler.js`, `uploader.js`, `cleanup.js`, `commands.js`, `transcribe.py`, `requirements.txt`, `SCHEDULER_README.md`
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Delete old root files**

```bash
git rm bot.js processor.js scheduler.js uploader.js cleanup.js commands.js transcribe.py requirements.txt SCHEDULER_README.md
```

- [ ] **Step 2: Rewrite `CLAUDE.md`** to the v2 architecture

Replace the Commands + Architecture + Conventions sections to reflect: `npm start` (bot), `npm run sidecar` (Python STT), `npm test` (`node --test`), `pytest` in `stt_sidecar/`; the two-process architecture; per-guild `MeetingManager`; pluggable summarizer; SQLite store; per-user-track diarization; secrets in `.env` (never via `/setup`); `DATA_DIR` defined once in `src/config/env.js`. Remove all references to the 6 AM–4 PM scheduler, the filename-DB, and Drive upload.

- [ ] **Step 3: Rewrite `README.md`** setup section

Document: install Node deps (`npm install`) + Python sidecar (`pip install -r stt_sidecar/requirements.txt`); copy `.env.example` → `.env`; run sidecar (`npm run sidecar`) and bot (`npm start`) as two processes (note PM2/systemd for both); `/setup` usage; supported providers; that keys go in `.env` only.

- [ ] **Step 4: Verify tests + syntax**

Run: `node --test && node --check src/index.js`
Expected: all PASS; no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove v1 implementation, update README + CLAUDE.md for v2"
```

---

## Task 20: Manual integration checklist (no code)

These cannot be unit-tested (live Discord voice + real models). Run once before declaring done.

- [ ] **Sidecar smoke:** `npm run sidecar`, then `curl localhost:8000/health` → `{"status":"ok",...}`. First `/transcribe` downloads the model (one-time).
- [ ] **Boot:** fill `.env` with a real `DISCORD_TOKEN`/`DISCORD_CLIENT_ID`/`GEMINI_API_KEY`; `npm start` → "Logged in"; slash commands appear in the server.
- [ ] **Auto-join:** two humans join a voice channel → bot joins, nickname shows `[REC]`.
- [ ] **Record + leave:** talk for ~1 min as two people; `/leave` (or both leave) → bot leaves, `[REC]` cleared.
- [ ] **Notes:** a thread (or notes channel) gets posted with TL;DR, topics, decisions, open questions, **action items grouped by person**, talk-time. Speaker names are correct.
- [ ] **History/search:** `/history` lists the meeting; `/search <word-you-said>` returns it.
- [ ] **Setup:** `/setup whisper_model:medium` → success embed; `/setup provider:openai` with no `OPENAI_API_KEY` → ephemeral error naming the missing key.
- [ ] **Failure path:** stop the sidecar, record a short meeting → bot posts the "processing failed" notice and meeting status is `transcription_failed` (does not crash).

---

## Self-review notes (addressed)

- **Spec coverage:** capture (T14), per-guild concurrency (T15), warm sidecar (T4), pluggable summarizer gemini/ollama/openai (T7–T8), structured notes + per-person action items (T7/T9), talk-time (T6/T9), thread delivery (T18 post.js), `/history`/`/summary`/`/search`/FTS (T2/T18), `/setup` runtime config + secrets-in-env validation (T3/T16/T18), `[REC]` indicator (T18), crash recovery (T2 findOrphanedMeetings + T18 boot), DATA_DIR once (T1), remove v1 + docs (T19), manual checklist (T20). `/ask` intentionally deferred (v1.1) per spec.
- **Type consistency:** `StructuredNotes` shape identical across notes.js/fake/gemini/ollama/openai/discord-notes/orchestrator. Talk-time shape `{displayName, ms, words, pct}` identical across summarize.js/db/discord-notes. `getSummarizer(cfg, env)` and `GeminiSummarizer(model, apiKey)` signatures consistent T7→T8.
- **No placeholders:** every code/step contains real content.
