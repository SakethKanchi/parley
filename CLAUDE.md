# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start            # run the bot (node bot.js) — the only long-running process
npm run process      # node processor.js (module of summary helpers; no standalone main)
npm run upload       # node uploader.js — upload everything in Summary/ to Google Drive
npm run upload-watch # node uploader.js --watch — poll Summary/ every 5s and upload new files
npm run cleanup      # node cleanup.js — run uploader then delete all PCM files (end-of-day cleanup)
pip install -r requirements.txt   # Python deps for transcription (openai-whisper, torch, numpy)
```

No test suite, linter, or build step exists. Verification is manual: run `node bot.js` and watch logs.

External runtime deps not in package.json: **FFmpeg** is bundled via `ffmpeg-static` (Node side) but `transcribe.py` also tries system `ffmpeg` first; **Python 3.8+** with Whisper must be importable as `python` (not `python3`) — `bot.js` spawns `python transcribe.py`.

## Architecture

End-to-end pipeline turning Discord voice into AI meeting summaries. Single Node process (`bot.js`) orchestrates everything; Python and other Node scripts are spawned as subprocesses.

**Data flow:**
1. `bot.js` joins a voice channel and, per speaker, decodes Opus → PCM (`prism.opus.Decoder`, 16kHz mono) into one `.pcm` file per speaking turn.
2. Every 5 min (`segmentProcessingInterval`), `processSegmentChronologically` converts that segment's PCM files → WAV, then FFmpeg-mixes them with per-speaker `adelay` offsets (derived from filename timestamps) into `{segment}_processed.wav`. This preserves conversation timing across speakers.
3. On stop, all `_processed.wav` segments concat → `_final.wav` → `transcribeAudio` spawns `python transcribe.py <wav>` (Whisper `base` model) → transcript.
4. `processor.summarizeTranscript` sends transcript to **Gemini** (`gemini-2.5-flash-lite`) for a narrative summary, then `saveSummaryLocally` **appends** it to `Summary/{channelName}_meetings.txt`.
5. At 4 PM (scheduler), `uploader.js` pushes `Summary/` files to Google Drive (upsert by filename), then PCM files are deleted.

**Module responsibilities:**
- `bot.js` — Discord gateway, the `recordingState` machine, per-speaker capture, segment timing, stop/finalize orchestration. The only stateful long-lived component.
- `processor.js` — exports `summarizeTranscript`, `saveSummaryLocally`, `cleanupTemporarySummaryFiles` (imported by both `bot.js` and `scheduler.js`). Gemini lives here.
- `scheduler.js` — operating-hours gate (6 AM–4 PM local time, `START_HOUR`/`END_HOUR`). `shouldBeActive()` guards every join path; at 4 PM runs `executeEndOfDayCleanup` (upload → delete PCM → clean temp summaries) then a shutdown callback.
- `transcribe.py` — standalone Whisper CLI; prints transcript to stdout, all diagnostics to stderr (bot reads stdout only).
- `uploader.js` — Google Drive OAuth2 (`credentials.json` → `token.json`), upsert-by-name into `FOLDER_ID`. Auto-re-auths on `invalid_grant`/401.
- `commands.js` — slash command JSON; `bot.js` auto-deploys these via REST on `ready` (no separate deploy step).
- `cleanup.js` — thin wrapper calling `scheduler.executeEndOfDayCleanup`.

## Critical conventions

**`DATA_DIR` resolution is duplicated in 4 files** (`bot.js`, `processor.js`, `scheduler.js`, `uploader.js`): `process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : process.cwd())`. The `/data` branch is for the Raspberry Pi / cloud persistent-volume deploy. `PCM_Files/`, `Summary/`, and OAuth files all live under `DATA_DIR`. Keep these in sync if changed.

**PCM filename format is load-bearing** — `{channelName}_{timestamp}_segment_{N}_{displayName}_{Date.now()}.pcm`. `processSegmentChronologically` parses it by splitting on `_`: last field = epoch ms (timing offset), second-to-last = username, and substring-matches the `{channelName}_{timestamp}_segment_{N}` segment key. Channel names or display names containing underscores will break this parsing. Same fragility in `summarizeTranscript`'s ISO-timestamp regex, which expects exactly `YYYY-MM-DDTHH-MM-SS-mmmZ`.

**Single concurrent recording.** `recordingState` is a module-level singleton — the bot records one channel at a time across the whole process. Auto-join/auto-leave is driven by human count: joins when >1 non-bot human present, leaves when ≤1.

**Two command surfaces, same handlers:** text (`!join`/`!leave` in `messageCreate`) and slash (`/join`/`/leave` in `interactionCreate`). Changes to join/leave behavior must be mirrored in both, plus the auto-join paths in `ready` and `voiceStateUpdate`.

**Secrets:** `.env` (DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, GEMINI_API_KEY, FOLDER_ID), `credentials.json`, and `token.json` are gitignored. `transcribe.py`'s shebang references `python3` but the bot invokes `python`.
