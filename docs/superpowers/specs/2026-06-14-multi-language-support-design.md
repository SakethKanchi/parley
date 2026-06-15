# Multi-language support — design

**Date:** 2026-06-14
**Status:** Approved, pending implementation

## Problem

Meetings are conducted in German with English words mixed in (code-switching).
Two issues:

1. Whisper auto-detection flip-flops per audio chunk on mixed-language speech,
   garbling the transcript.
2. The summary/notes always come out in the LLM's default language (usually
   English) with no way to control it.

## Current state (already exists)

Transcription language is **already plumbed end-to-end**, just not surfaced well:

- `/setup` exposes a free-text `language` option ("Language code or auto").
- Stored per-guild in `guild_config.language` (default `'auto'`).
- Flows: `getGuildConfig` → `src/pipeline/transcribe.js` → `stt-client.js`
  (`form.append('language', ...)`) → `stt_sidecar/server.py`
  (`lang = None if language == "auto" else language`) → `m.transcribe(path, language=lang)`.

So `/setup language:de` works **today**. Gaps: it's a raw text field (no picker),
and the language never reaches the summarizer.

## Scope

In scope:
1. Convert `language` to a Discord dropdown; add a new `summary_language` dropdown.
2. Add `summaryLanguage` to per-guild config + DB migration.
3. Wire `summaryLanguage` into every summarizer adapter via a prompt instruction.

Out of scope (separate future spec):
- Summary templates (standup / retro / decision-log shapes).

## Design

### 1. `/setup` pickers — `src/commands/definitions.js`

Replace the free-text `language` option with a dropdown, and add a
`summary_language` dropdown. Both share the **list B** language set:

| Display    | Whisper code |
|------------|--------------|
| German     | de |
| English    | en |
| Spanish    | es |
| French     | fr |
| Italian    | it |
| Portuguese | pt |
| Dutch      | nl |
| Russian    | ru |
| Japanese   | ja |
| Chinese    | zh |

- `language` choices: the 10 above + **Auto** (`auto`). Default `auto`.
  For DE+EN meetings, users pick **German** to stop per-chunk flip-flop.
- `summary_language` choices: the 10 above + **Match transcription**
  (sentinel `match`). Default **English** (`en`).

Discord allows up to 25 choices per option; 11 is well under the cap.

### 2. Config — `src/store/config.js` + DB

- Add `summaryLanguage` to `DEFAULTS` with value `'en'`.
- Add to `COLS` mapping (`summaryLanguage: 'summary_language'`), `fromRow`/row
  builders, and the `INSERT OR REPLACE` column list + values.
- DB migration: `ALTER TABLE guild_config ADD COLUMN summary_language` (in
  `src/store/db.js`), guarded so it runs once against pre-existing databases
  (e.g. check `PRAGMA table_info(guild_config)` for the column before adding).
  Existing rows get the default applied on read via `DEFAULTS` merge.

### 3. Validation — `src/commands/setup-logic.js`

- `if (input.summary_language !== undefined) patch.summaryLanguage = input.summary_language;`
- Validate both `language` and `summary_language` against the allowed code set
  (defense-in-depth even though Discord restricts to the choice list). Reject
  unknown codes with a clear message.

### 4. Wire into summary — `src/pipeline/orchestrator.js` + adapters

- New shared module `src/adapters/summarizer/languages.js`: exports the
  code→display-name map (e.g. `de → "German"`) and a resolver.
- Orchestrator resolves the effective summary language:
  - If `summaryLanguage === 'match'`: use the guild's transcription `language`.
    If that is `auto`, the instruction becomes "the same language as the
    transcript" (no fixed name, let the LLM infer).
  - Otherwise: use `summaryLanguage` directly.
- Orchestrator passes the resolved value into `meta` (e.g. `meta.summaryLanguage`).
- Each adapter (`gemini.js`, `openai.js`, `ollama.js`, `opencode.js`) appends one
  line to its prompt:
  - fixed language: `Write the entire summary in {LanguageName}.`
  - `match` + `auto` transcription: `Write the entire summary in the same language as the transcript.`
  - When the resolved language is English (the default), the instruction may still
    be emitted harmlessly, or skipped — implementer's choice; behavior must match
    the default of English output.

### Data flow

```
/setup → validateSetup → guild_config { language, summaryLanguage }
  ├─ transcription: language → transcribe.js → stt-client → whisper   (already works)
  └─ summary: summaryLanguage → orchestrator (resolve match/auto)
             → meta.summaryLanguage → adapter prompt line
```

## Testing

- `setup-logic` test: accepts valid `summary_language`; rejects unknown code.
- config round-trip test: `summaryLanguage` persists and defaults to `'en'`;
  migration adds the column to an existing db without data loss.
- adapter prompt test (at least one adapter, ideally a shared helper test):
  - fixed language → "Write the entire summary in German." present.
  - `match` + `auto` → "same language as the transcript" present.
  - language resolver maps codes → names correctly.

## Risks / notes

- Code-switching: forcing `language:de` is the recommended fix for DE+EN; document
  this in `/setup` help text or README.
- Migration must be idempotent — guard against adding the column twice.
