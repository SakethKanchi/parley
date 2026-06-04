<p align="center">
  <img width="300" src="./misc/logo.png" />
</p>

# Discord Meeting Bot

A self-hosted Discord bot that automatically records voice meetings, transcribes audio per-speaker locally, and posts AI-generated structured meeting notes directly in Discord threads. No cloud recording service required.

## How it works

- Joins a voice channel (manually via `/join` or automatically when 2+ humans are present).
- Captures each speaker's audio track separately — Discord delivers per-user streams, so speaker attribution is exact with no ML diarization needed.
- On meeting end, a pipeline transcribes each track through a local faster-whisper sidecar, merges utterances by timestamp, summarizes with a pluggable AI provider, and posts structured notes (TL;DR, topics, decisions, action items) to a Discord thread.

## Prerequisites

- **Node.js >= 22.5** (uses the built-in `node:sqlite` module)
- **Python 3.10+** for the STT sidecar
- **ffmpeg** — bundled automatically via `ffmpeg-static` (no system install needed)
- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- An API key for at least one summarizer (Gemini is the default and has a free tier)

## Installation

### 1. Clone and install Node dependencies

```bash
git clone <repo-url>
cd Discord_Meeting_Bot
npm install
```

### 2. Set up the Python STT sidecar

```bash
cd stt_sidecar
python -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ..
```

The sidecar loads the faster-whisper model once on startup and keeps it warm for the lifetime of the process.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id

# STT sidecar URL (default is fine if running locally)
STT_URL=http://127.0.0.1:8000

# Summarizer — provide the key for whichever provider you use
GEMINI_API_KEY=your_gemini_api_key      # gemini (default, free tier available)
OPENAI_API_KEY=your_openai_api_key      # openai-compatible providers
OLLAMA_URL=http://127.0.0.1:11434       # ollama (fully offline, no key needed)

# Optional: persistent data directory (defaults to /data if present, else cwd)
DATA_DIR=
```

API keys go in `.env` only. Do not paste keys into Discord — message content is logged by Discord.

### 4. Invite the bot to your server

In the Discord Developer Portal, under OAuth2 → URL Generator, select the `bot` and `applications.commands` scopes. Under Bot Permissions, select: Connect, Speak, Use Voice Activity, Send Messages, Create Public Threads, Embed Links. Copy the generated URL and open it to invite the bot.

Enable these Privileged Gateway Intents for the bot: **Server Members Intent** (needed to identify humans vs bots for auto-join logic).

## Running

The bot requires **two processes** running simultaneously:

**Terminal 1 — STT sidecar:**
```bash
npm run sidecar
```

**Terminal 2 — Discord bot:**
```bash
npm start
```

For production, use a process manager like pm2 or systemd to run both:

```bash
# pm2 example
pm2 start "npm run sidecar" --name meeting-sidecar
pm2 start "npm start" --name meeting-bot
pm2 save
```

## Commands

| Command | Description |
|---------|-------------|
| `/join` | Join your current voice channel and start recording |
| `/leave` | Stop recording and leave the voice channel |
| `/summary` | Post the notes from the most recent meeting in this channel |
| `/history` | List recent meetings with metadata |
| `/search <query>` | Full-text search across all meeting transcripts |
| `/setup` | Configure the bot for this server (see below) |

**Auto-join / auto-leave:** The bot automatically joins when more than one human is in a voice channel and leaves when only one (or zero) remain. This can be toggled via `/setup`.

## Configuration via /setup

Run `/setup` in any text channel to configure the bot for your server. All settings are per-guild.

| Setting | Description |
|---------|-------------|
| `provider` | Summarizer: `gemini` (default), `openai`, `ollama` |
| `model` | Model name for the chosen provider |
| `whisper_model` | faster-whisper model size (e.g. `base`, `small`, `medium`) |
| `notes_channel` | Channel where meeting notes are posted |
| `thread` | Whether to post notes as a thread (recommended) |
| `autojoin` | Enable/disable automatic join on voice activity |
| `language` | Transcription language hint (e.g. `en`, `es`) |

## Supported summarizers

- **gemini** (default) — uses Gemini 2.5 Flash. Has a free tier; set `GEMINI_API_KEY`.
- **openai** — any OpenAI-compatible endpoint; set `OPENAI_API_KEY` and optionally `OPENAI_BASE_URL` for third-party providers.
- **ollama** — fully offline, no API key required. Run Ollama locally and set `OLLAMA_URL`.

## Privacy and consent

The bot sets `[REC]` in its nickname while a recording is active so all channel members can see it. It is your responsibility to obtain consent from all participants before recording, as required by your jurisdiction.

Audio is processed entirely on the machine running the bot. No audio is sent to any third-party service; only the final transcript text is sent to your chosen summarizer API.

## Running tests

```bash
npm test                                          # all Node unit tests
node --test test/<name>.test.js                   # single test file
cd stt_sidecar && .venv/bin/python -m pytest test_server.py -q   # sidecar tests
```

## License

ISC
