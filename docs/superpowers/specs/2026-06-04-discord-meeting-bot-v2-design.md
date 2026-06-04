# Discord Meeting Bot v2 — Design

**Date:** 2026-06-04
**Status:** Approved for planning
**Supersedes:** the existing `bot.js`-centric implementation (full rewrite)

## 1. Goal

A Discord bot that records voice meetings, transcribes them with per-speaker
attribution, and posts industry-grade AI meeting notes (summary + decisions +
open questions + action items assigned per person + talk-time stats) directly
into Discord. Past meetings are queryable via slash commands.

Free and FOSS: no paid API is required to run it. Default summarizer is Google
Gemini's free tier; a fully-offline Ollama path is a config swap.

### Audience / positioning

Single-tenant, self-host-clean: works great for one owner's server(s) today and
is cleanly cloneable by others. **No SaaS** (no accounts, billing, or
multi-tenant control plane) in scope — but the recording→transcribe→summarize
engine is kept separate from delivery/config so a SaaS wrapper is possible later
without rewriting the core.

Market position: paid Discord competitors exist (NotesBot, DiscMeet, Memolin,
Kazkar); the dominant Discord recorder (Craig) only produces audio. The open gap
is a **FOSS, self-hosted, live bot** that delivers Fathom/Fireflies-grade notes
into Discord automatically. The closest FOSS comparable (TASMAS) is offline
post-processing, not a live bot.

## 2. Scope

### In scope (v1)

- Multi-meeting capture (per guild + channel; no global singleton).
- Per-speaker audio capture using Discord's per-user streams (free diarization —
  no pyannote/ML diarization).
- Local STT via a persistent (warm-model) `faster-whisper` sidecar.
- Pluggable summarizer adapter: `gemini` (default), `ollama`, `openai`-compatible.
- **Rich structured summary:** TL;DR, topic sections, decisions, open questions,
  and **action items grouped by assignee** (tasks per person).
- **Talk-time stats:** % talk-time and word count per speaker.
- **Delivery in a Discord thread** under the meeting channel (or a configured
  notes channel).
- **Searchable history:** `/history`, `/summary`, `/search <keyword>` (FTS over
  stored utterances).
- **`/setup` runtime config** (admin-only): summarizer provider+model, whisper
  model size, notes channel, thread on/off, auto-join toggle, language. Persisted
  per-guild in SQLite, applied without restart.
- Minimal **`[REC]` recording indicator** in the bot's nickname while recording.
- Crash recovery: orphaned in-progress meetings are processed on boot.

### Out of scope

- SaaS: accounts, billing, multi-tenant control plane.
- Live/real-time transcript (processing is post-meeting).
- Full consent system beyond the `[REC]` indicator.
- Standalone transcript file export / Google Drive upload (transcripts are stored
  in SQLite for `/search`, not exported as files).
- Slack/Notion/CRM integrations.
- Sentiment analysis, custom keyword/topic tagging.

### Deferred to v1.1

- Cross-meeting `/ask` (RAG-style Q&A over the meeting archive).

## 3. Architecture

Two processes on one host:

```
┌─────────────────────────── Node (discord.js) ───────────────────────────┐
│  Gateway ─ events ─→ MeetingManager (per guild+channel, concurrent)      │
│       │                    │                                             │
│   VoiceCapture        Pipeline orchestrator                              │
│   per-user PCM tracks      │                                             │
│       │                    ├─→ STT client ──HTTP──┐                      │
│   [REC] indicator          ├─→ Summarizer adapter │  (gemini|ollama|...) │
│                            └─→ Store (SQLite)      │                      │
└────────────────────────────────────────────────────┼────────────────────┘
                                                       │ localhost
                          ┌────────────────────────────▼──────────────┐
                          │  Python STT sidecar (FastAPI)              │
                          │  faster-whisper, model loaded ONCE, warm   │
                          └────────────────────────────────────────────┘
```

Two key changes vs the existing implementation:
- **No global singleton.** `MeetingManager` keys active meetings by
  `guild_id + channel_id`, so multiple channels/servers record concurrently.
- **Warm model.** The Python sidecar loads the whisper model once at startup,
  fixing the per-call `whisper.load_model()` reload in the current code.

### Diarization (free)

Discord exposes a separate audio stream per speaking user. Each user's track is
transcribed independently and every resulting utterance is tagged with that
user's Discord display name. Utterances across all speakers are then merged by
start timestamp into one ordered, speaker-labeled transcript. No ML diarization.

## 4. Components

Each module has one purpose, a defined interface, and is testable in isolation.

| Module | Responsibility | Depends on |
|--------|----------------|-----------|
| `voice/capture.js` | Subscribe per user; decode Opus→PCM per speaking turn; record start/stop ms; drop empty tracks | `@discordjs/voice`, `prism-media` |
| `voice/meeting-manager.js` | Meeting lifecycle: start/stop, auto-join (>1 human), auto-leave (≤1 human), `[REC]` nickname, concurrency map | `capture`, `pipeline`, `store` |
| `pipeline/transcribe.js` | PCM→WAV (ffmpeg-static); POST each speaker track to sidecar; produce utterances `{user, displayName, startMs, endMs, text}` | `stt-client` |
| `pipeline/summarize.js` | Merge+sort utterances → labeled transcript; compute talk-time stats; call summarizer adapter; assemble notes | `adapters/summarizer/*` |
| `pipeline/orchestrator.js` | Drives a finalized meeting through transcribe → summarize → store → deliver; error/retry handling | the above |
| `adapters/summarizer/index.js` | Factory: returns adapter for configured provider | provider adapters |
| `adapters/summarizer/{gemini,ollama,openai}.js` | Implement `summarize(transcript, meta) → StructuredNotes` | provider SDK / HTTP |
| `adapters/stt-client.js` | HTTP client to the Python sidecar; retry/timeout | — |
| `store/db.js` | SQLite schema, migrations, queries (better-sqlite3) | `better-sqlite3` |
| `store/config.js` | Per-guild config read/write (backs `/setup`) | `db` |
| `delivery/discord-notes.js` | Format `StructuredNotes` → Discord message(s); create thread; post | discord.js |
| `commands/*.js` | `/join /leave /summary /history /search /setup` definitions + handlers | `store`, `meeting-manager` |
| `commands/deploy.js` | Register slash commands on ready | discord.js REST |
| `stt_sidecar/server.py` | FastAPI app; warm `faster-whisper`; `POST /transcribe`; `GET /health` | `faster-whisper`, `fastapi`, `uvicorn` |
| `config/env.js` | Load+validate `.env`; expose typed config; fail fast on missing required keys | `dotenv` |

### Summarizer adapter interface

```
summarize(transcript: string, meta: { channelName, date, attendees[] })
  → StructuredNotes
```

```
StructuredNotes = {
  tldr: string,
  topics: [{ title: string, points: string[] }],
  decisions: string[],
  openQuestions: string[],
  actionItems: [{ assignee: string|null, task: string }],  // grouped by person on render
}
```

All providers return this same shape. Provider differences (prompt format, JSON
parsing, model name) are hidden behind the adapter. The orchestrator and delivery
layers never know which provider ran.

## 5. Data flow

1. ≥2 non-bot humans present in a voice channel (and auto-join enabled) →
   `MeetingManager` joins, sets `[REC]` nickname, inserts a `meetings` row with
   `status='recording'`, captures initial attendees.
2. On each speaking turn, `capture` writes
   `{DATA_DIR}/audio/{meetingId}/{userId}_{startMs}.pcm` and records the turn's
   start/stop ms. Empty/silent tracks are deleted.
3. Meeting ends — manual `/leave`, or auto when humans ≤1. Manager marks
   `status='processing'` and hands the meeting to the orchestrator.
4. `transcribe`: each PCM → WAV (16kHz mono s16) → POST to sidecar →
   `{ text, words[] }`. One `utterances` row per turn.
5. `summarize`: utterances sorted by `start_ms` → `[mm:ss] DisplayName: text`
   transcript; talk-time stats computed from `end_ms - start_ms` per speaker;
   adapter returns `StructuredNotes`.
6. Store `summaries` row (notes JSON + model used + talk-time JSON). Mark meeting
   `status='done'`.
7. `delivery` posts a thread under the meeting channel (or configured notes
   channel) with the formatted notes + talk-time stats.
8. Audio files for the meeting are deleted after successful delivery (configurable
   retention; default delete).

## 6. Data model (SQLite, better-sqlite3)

```sql
meetings(
  id INTEGER PRIMARY KEY,
  guild_id TEXT, channel_id TEXT, channel_name TEXT,
  started_at TEXT, ended_at TEXT,
  status TEXT  -- recording | processing | done | transcription_failed | summary_failed
);

attendees(meeting_id INTEGER, user_id TEXT, display_name TEXT);

utterances(
  id INTEGER PRIMARY KEY,
  meeting_id INTEGER, user_id TEXT, display_name TEXT,
  start_ms INTEGER, end_ms INTEGER, text TEXT
);
-- FTS5 virtual table mirrors utterances.text for /search

summaries(
  meeting_id INTEGER PRIMARY KEY,
  notes_json TEXT,        -- StructuredNotes
  talktime_json TEXT,     -- [{displayName, ms, words, pct}]
  model_used TEXT, created_at TEXT
);

guild_config(
  guild_id TEXT PRIMARY KEY,
  summarizer_provider TEXT, summarizer_model TEXT,
  whisper_model TEXT, notes_channel_id TEXT,
  use_thread INTEGER, auto_join INTEGER, language TEXT
);
```

Defaults applied when a guild has no `guild_config` row: provider `gemini`, a
current Gemini Flash model, whisper `small`, notes in the meeting channel,
threads on, auto-join on, language `auto`.

## 7. Slash commands

| Command | Who | Effect |
|---------|-----|--------|
| `/join` | member in a voice channel | Bot joins + starts recording (respects auto-join-independent manual start) |
| `/leave` | member | Stop recording, finalize, process |
| `/summary [meeting]` | anyone | Post the stored notes for a meeting (default: most recent) |
| `/history` | anyone | List recent meetings (id, channel, date, status) |
| `/search <keyword>` | anyone | FTS over utterances; return matching meetings + snippets |
| `/setup ...` | admin (Manage Guild) | Read/update `guild_config` (provider, model, whisper size, notes channel, thread, auto-join, language) |

Both legacy text triggers (`!join`/`!leave`) and slash commands route to the same
manager methods. Auto-join/auto-leave in `voiceStateUpdate` and on-boot recovery
also route to the same methods (no duplicated lifecycle logic).

## 8. Configuration & secrets

- `config/env.js` loads `.env`, validates required keys at startup, fails fast.
- Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`. STT sidecar URL
  (`STT_URL`, default `http://127.0.0.1:8000`).
- Provider keys live in `.env` only: `GEMINI_API_KEY`, `OPENAI_API_KEY`,
  `OLLAMA_URL`. **Never entered via slash command** — Discord retains message
  content, so a key typed into chat is a credential leak.
- `/setup` selects provider + model name + behavior only. It validates that the
  needed key/URL exists in env for the chosen provider and returns an error
  (ephemeral) if not.
- `DATA_DIR` resolution stays as today (`process.env.DATA_DIR` → `/data` if it
  exists → cwd) but is defined **once** in `config/env.js` and imported, not
  duplicated across files.
- `.env`, `credentials.json`, `token.json`, `*.pcm`, `*.wav`, the SQLite db, and
  `audio/` remain gitignored.

## 9. Error handling

- **Sidecar down/timeout:** retry once; on failure mark meeting
  `transcription_failed`, keep PCM for manual retry, post a notice to the channel.
- **Empty/silent track:** skipped, never fatal (current empty-file detection kept).
- **Summarizer rate-limit (e.g. Gemini 429):** exponential backoff; if still
  failing, store the transcript and mark `summary_failed`, post "transcript saved,
  summary pending" — never lose the meeting.
- **Crash mid-meeting:** on boot, find `status IN ('recording','processing')`
  meetings with orphaned audio and run them through the orchestrator (replaces the
  ad-hoc `process_existing.js`).
- **ffmpeg/STT errors:** always logged with the meeting id; never silent.
- **Bad `/setup` value:** validated, rejected with an ephemeral error; config
  unchanged.

## 10. Testing

- **Unit (node --test):** utterance merge/sort, talk-time computation,
  `StructuredNotes` → Discord formatting, DB queries, FTS search, config
  read/write, filename parsing. Pure functions, no Discord.
- **Adapter contract test:** a fake summarizer returns a fixed `StructuredNotes`;
  assert orchestrator + delivery handle it. Each real adapter has a parse test
  against a captured sample response (no live API in CI).
- **Sidecar (pytest):** POST a short WAV fixture to `/transcribe`, assert
  non-empty text and well-formed word timestamps.
- **Integration (manual checklist):** real 2-person voice call → notes thread
  posted with speaker-attributed action items + talk-time. discord.js voice
  receive can't be meaningfully unit-tested, so capture is validated by this
  checklist.

## 11. Project layout

```
src/
  index.js                  # entrypoint: env, db, deploy commands, login
  config/env.js
  voice/capture.js
  voice/meeting-manager.js
  pipeline/{transcribe,summarize,orchestrator}.js
  adapters/stt-client.js
  adapters/summarizer/{index,gemini,ollama,openai}.js
  store/{db,config}.js
  delivery/discord-notes.js
  commands/{join,leave,summary,history,search,setup,deploy}.js
stt_sidecar/
  server.py
  requirements.txt          # faster-whisper, fastapi, uvicorn
test/                       # node --test
docs/superpowers/specs/
```

## 12. Migration / cutover

Full rewrite under `src/` + `stt_sidecar/`. The old root `.js` files
(`bot.js`, `processor.js`, `scheduler.js`, `uploader.js`, `cleanup.js`,
`commands.js`, `transcribe.py`) are removed once v2 reaches feature parity. The
6 AM–4 PM scheduler is dropped (replaced by the `auto-join` toggle). No data
migration needed (old output was flat text files; v2 starts a fresh SQLite db).
`README.md` and `CLAUDE.md` are updated to the v2 architecture.
