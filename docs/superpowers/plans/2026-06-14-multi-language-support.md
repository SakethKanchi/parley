# Multi-language Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add friendly language pickers to `/setup` and let each guild control the summary output language independently of the transcription language.

**Architecture:** Transcription language already flows end-to-end (config → STT sidecar). This adds (1) Discord dropdowns for `language` + a new `summary_language`, (2) a `summaryLanguage` per-guild config field with DB migration, (3) a shared `languages.js` helper that resolves the effective summary language and produces a prompt instruction appended by every summarizer adapter.

**Tech Stack:** Node 22 ESM, discord.js, node:sqlite, node:test.

---

## File structure

- Create: `src/adapters/summarizer/languages.js` — language table, code→name map, `resolveSummaryLanguage(cfg)`, `summaryLanguageInstruction(effective)`.
- Create: `test/languages.test.js` — unit tests for the helper.
- Modify: `src/store/config.js` — add `summaryLanguage` to DEFAULTS/COLS/fromRow/INSERT.
- Modify: `src/store/db.js` — add `summary_language` column to schema + idempotent ALTER for existing dbs.
- Modify: `src/commands/setup-logic.js` — validate `language` + `summary_language` codes; pass `summaryLanguage` to patch.
- Modify: `src/commands/definitions.js` — convert `language` to dropdown, add `summary_language` dropdown.
- Modify: `src/index.js` — read `summary_language` from the interaction.
- Modify: `src/pipeline/orchestrator.js` — resolve and put `summaryLanguage` on `meta`.
- Modify: `src/adapters/summarizer/{gemini,openai,ollama,opencode}.js` — append the language instruction to the prompt.
- Modify: `test/config.test.js`, `test/setup-logic.test.js`, `test/definitions.test.js`, `test/summarizer-http.test.js` — extend coverage.

Conventions (from reading the code):
- Codes are Whisper language codes. **List B:** German `de`, English `en`, Spanish `es`, French `fr`, Italian `it`, Portuguese `pt`, Dutch `nl`, Russian `ru`, Japanese `ja`, Chinese `zh`.
- `language` choices = list B + `auto` (default `auto`).
- `summary_language` choices = list B + `match` ("Match transcription"); default `en`.
- All summarizer adapters build `const prompt = \`${SUMMARY_PROMPT}\n\n...\`` — we inject the instruction right after `SUMMARY_PROMPT`.

---

### Task 1: `languages.js` helper module

**Files:**
- Create: `src/adapters/summarizer/languages.js`
- Test: `test/languages.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/languages.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGES,
  LANGUAGE_CODES,
  SUMMARY_LANGUAGE_VALUES,
  resolveSummaryLanguage,
  summaryLanguageInstruction,
} from '../src/adapters/summarizer/languages.js';

test('LANGUAGES is list B with code+name', () => {
  assert.equal(LANGUAGES.length, 10);
  assert.deepEqual(LANGUAGES.find((l) => l.code === 'de'), { code: 'de', name: 'German' });
});

test('LANGUAGE_CODES = 10 langs + auto (transcription set)', () => {
  assert.equal(LANGUAGE_CODES.has('de'), true);
  assert.equal(LANGUAGE_CODES.has('auto'), true);
  assert.equal(LANGUAGE_CODES.has('match'), false);
  assert.equal(LANGUAGE_CODES.size, 11);
});

test('SUMMARY_LANGUAGE_VALUES = 10 langs + match (no auto)', () => {
  assert.equal(SUMMARY_LANGUAGE_VALUES.has('en'), true);
  assert.equal(SUMMARY_LANGUAGE_VALUES.has('match'), true);
  assert.equal(SUMMARY_LANGUAGE_VALUES.has('auto'), false);
  assert.equal(SUMMARY_LANGUAGE_VALUES.size, 11);
});

test('resolveSummaryLanguage defaults to en when unset', () => {
  assert.equal(resolveSummaryLanguage({}), 'en');
});

test('resolveSummaryLanguage returns fixed code as-is', () => {
  assert.equal(resolveSummaryLanguage({ summaryLanguage: 'de', language: 'auto' }), 'de');
});

test('resolveSummaryLanguage match uses transcription language', () => {
  assert.equal(resolveSummaryLanguage({ summaryLanguage: 'match', language: 'de' }), 'de');
});

test('resolveSummaryLanguage match + auto transcription yields auto', () => {
  assert.equal(resolveSummaryLanguage({ summaryLanguage: 'match', language: 'auto' }), 'auto');
});

test('instruction names the language for a fixed code', () => {
  assert.match(summaryLanguageInstruction('de'), /Write the entire summary in German\./);
});

test('instruction for auto says same language as transcript', () => {
  assert.match(summaryLanguageInstruction('auto'), /same language as the transcript/);
});

test('instruction for unknown code is empty', () => {
  assert.equal(summaryLanguageInstruction('zz'), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/languages.test.js`
Expected: FAIL — cannot find module `languages.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/adapters/summarizer/languages.js`:

```js
// Whisper language codes (list B). Shared by /setup pickers, validation, and the
// summary-language prompt instruction so the set stays in one place.
export const LANGUAGES = [
  { code: 'de', name: 'German' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
];

const CODE_TO_NAME = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name]));

// Transcription accepts the 10 langs + 'auto' (Whisper auto-detect).
export const LANGUAGE_CODES = new Set([...LANGUAGES.map((l) => l.code), 'auto']);

// Summary accepts the 10 langs + 'match' (follow the transcription language).
export const SUMMARY_LANGUAGE_VALUES = new Set([...LANGUAGES.map((l) => l.code), 'match']);

// Resolve the effective summary language code. 'match' follows the guild's
// transcription language; an unset value defaults to English.
export function resolveSummaryLanguage(cfg = {}) {
  const sl = cfg.summaryLanguage || 'en';
  if (sl === 'match') return cfg.language || 'auto';
  return sl;
}

// One-line instruction appended to every summarizer prompt. 'auto' means the
// transcription language is unknown, so let the model mirror the transcript.
export function summaryLanguageInstruction(effective) {
  if (!effective || effective === 'auto') {
    return '\n\nWrite the entire summary in the same language as the transcript.';
  }
  const name = CODE_TO_NAME[effective];
  if (!name) return '';
  return `\n\nWrite the entire summary in ${name}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/languages.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/summarizer/languages.js test/languages.test.js
git commit -m "feat: add shared language table + summary-language resolver"
```

---

### Task 2: Config field + DB migration

**Files:**
- Modify: `src/store/config.js`
- Modify: `src/store/db.js:29-34` (schema) + `src/store/db.js:37-40` (openDb)
- Test: `test/config.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/config.test.js`:

```js
test('summaryLanguage defaults to en', () => {
  const db = openDb(':memory:');
  assert.equal(getGuildConfig(db, 'g').summaryLanguage, 'en');
});

test('setGuildConfig persists summaryLanguage', () => {
  const db = openDb(':memory:');
  setGuildConfig(db, 'g', { summaryLanguage: 'de' });
  assert.equal(getGuildConfig(db, 'g').summaryLanguage, 'de');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — `summaryLanguage` is `undefined`.

- [ ] **Step 3: Add the schema column + idempotent migration in `src/store/db.js`**

In the `SCHEMA` string, change the `guild_config` table (lines 29-34) so the last line reads:

```js
  use_thread INTEGER, auto_join INTEGER, language TEXT, summary_language TEXT
);
```

Then in `openDb`, right after `sql.exec(SCHEMA);` (line 40), add an idempotent migration so existing on-disk dbs gain the column:

```js
  // Migration: add summary_language to dbs created before the column existed.
  const cols = sql.prepare(`PRAGMA table_info(guild_config)`).all();
  if (!cols.some((c) => c.name === 'summary_language')) {
    sql.exec(`ALTER TABLE guild_config ADD COLUMN summary_language TEXT`);
  }
```

- [ ] **Step 4: Wire the field through `src/store/config.js`**

Add to `DEFAULTS` (after `language: 'auto',`):

```js
  summaryLanguage: 'en',
```

Add to `COLS` (after `language: 'language',`):

```js
  summaryLanguage: 'summary_language',
```

Add to `fromRow` return (after the `language:` line):

```js
    summaryLanguage: row.summary_language ?? DEFAULTS.summaryLanguage,
```

In `setGuildConfig`, add `summary_language` to the INSERT column list and `@summaryLanguage` to VALUES:

```js
    `INSERT OR REPLACE INTO guild_config
       (guild_id, summarizer_provider, summarizer_model, whisper_model, notes_channel_id, use_thread, auto_join, language, summary_language)
     VALUES (@guildId, @summarizerProvider, @summarizerModel, @whisperModel, @notesChannelId, @useThread, @autoJoin, @language, @summaryLanguage)`
```

And add to the `.run({ ... })` object (after `language: merged.language,`):

```js
    summaryLanguage: merged.summaryLanguage,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/config.test.js test/db.test.js`
Expected: PASS (existing + 2 new config tests; db tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/store/config.js src/store/db.js test/config.test.js
git commit -m "feat: persist per-guild summaryLanguage with idempotent migration"
```

---

### Task 3: Validate `summary_language` + language codes in setup-logic

**Files:**
- Modify: `src/commands/setup-logic.js`
- Test: `test/setup-logic.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/setup-logic.test.js`:

```js
test('accepts valid language + summary_language', () => {
  const r = validateSetup({ language: 'de', summary_language: 'en' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.language, 'de');
  assert.equal(r.patch.summaryLanguage, 'en');
});

test('accepts summary_language match', () => {
  const r = validateSetup({ summary_language: 'match' }, env);
  assert.equal(r.ok, true);
  assert.equal(r.patch.summaryLanguage, 'match');
});

test('rejects unknown transcription language', () => {
  const r = validateSetup({ language: 'zz' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /language/i);
});

test('rejects unknown summary_language', () => {
  const r = validateSetup({ summary_language: 'zz' }, env);
  assert.equal(r.ok, false);
  assert.match(r.error, /summary language/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/setup-logic.test.js`
Expected: FAIL — unknown codes currently pass through; `summaryLanguage` undefined.

- [ ] **Step 3: Implement validation**

In `src/commands/setup-logic.js`, add the import at the top (after the existing import on line 1):

```js
import { LANGUAGE_CODES, SUMMARY_LANGUAGE_VALUES } from '../adapters/summarizer/languages.js';
```

Replace the existing `language` line (line 36, `if (input.language !== undefined) patch.language = input.language;`) with:

```js
  if (input.language !== undefined) {
    if (!LANGUAGE_CODES.has(input.language)) {
      return { ok: false, error: `Invalid language. Use one of: ${[...LANGUAGE_CODES].join(', ')}.` };
    }
    patch.language = input.language;
  }

  if (input.summary_language !== undefined) {
    if (!SUMMARY_LANGUAGE_VALUES.has(input.summary_language)) {
      return { ok: false, error: `Invalid summary language. Use one of: ${[...SUMMARY_LANGUAGE_VALUES].join(', ')}.` };
    }
    patch.summaryLanguage = input.summary_language;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/setup-logic.test.js`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup-logic.js test/setup-logic.test.js
git commit -m "feat: validate language and summary_language codes in /setup"
```

---

### Task 4: `/setup` dropdowns in definitions.js

**Files:**
- Modify: `src/commands/definitions.js`
- Test: `test/definitions.test.js`

- [ ] **Step 1: Update the failing test**

In `test/definitions.test.js`, update the option-names assertion to include `summary_language`:

```js
test('setup command exposes provider/model/whisper/thread/autojoin/channel/language/summary_language options', () => {
  const setup = commandsJSON().find((c) => c.name === 'setup');
  const names = setup.options.map((o) => o.name).sort();
  assert.deepEqual(names, ['autojoin', 'language', 'model', 'notes_channel', 'provider', 'summary_language', 'thread', 'whisper_model']);
});

test('language option offers a German choice and auto', () => {
  const setup = commandsJSON().find((c) => c.name === 'setup');
  const lang = setup.options.find((o) => o.name === 'language');
  const values = lang.choices.map((c) => c.value);
  assert.ok(values.includes('de'));
  assert.ok(values.includes('auto'));
});

test('summary_language option offers match', () => {
  const setup = commandsJSON().find((c) => c.name === 'setup');
  const sl = setup.options.find((o) => o.name === 'summary_language');
  const values = sl.choices.map((c) => c.value);
  assert.ok(values.includes('match'));
  assert.ok(values.includes('en'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/definitions.test.js`
Expected: FAIL — `summary_language` not present; `language` has no `choices`.

- [ ] **Step 3: Implement the dropdowns**

In `src/commands/definitions.js`, add the import (after line 3):

```js
import { LANGUAGES } from '../adapters/summarizer/languages.js';
```

Replace the final `language` option line (line 29, `.addStringOption((o) => o.setName('language').setDescription('Language code or "auto"')),`) with:

```js
      .addStringOption((o) => o.setName('language').setDescription('Spoken language (pick German to fix DE/EN mixing)')
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.code })), { name: 'Auto-detect', value: 'auto' }))
      .addStringOption((o) => o.setName('summary_language').setDescription('Language for the notes/summary')
        .addChoices(...LANGUAGES.map((l) => ({ name: l.name, value: l.code })), { name: 'Match transcription', value: 'match' })),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/definitions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/definitions.js test/definitions.test.js
git commit -m "feat: add language + summary_language dropdowns to /setup"
```

---

### Task 5: Read `summary_language` from the interaction

**Files:**
- Modify: `src/index.js:286-295`

(No unit test — `index.js` Discord wiring is untested in this repo; covered by the validateSetup tests in Task 3. Verify with the full suite.)

- [ ] **Step 1: Add the option read**

In `src/index.js`, in the `setup` handler `input` object (after the `language:` line at 294), add:

```js
        summary_language: interaction.options.getString('summary_language') ?? undefined,
```

- [ ] **Step 2: Run the full suite to confirm nothing breaks**

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: read summary_language from /setup interaction"
```

---

### Task 6: Wire summary language into the summarizers

**Files:**
- Modify: `src/pipeline/orchestrator.js:26`
- Modify: `src/adapters/summarizer/gemini.js:26`, `openai.js:12`, `ollama.js:11`, `opencode.js:17`
- Test: `test/summarizer-http.test.js`

- [ ] **Step 1: Write the failing test**

Inspect `test/summarizer-http.test.js` to match its existing fetch-stub style, then add a test that asserts the instruction reaches the prompt. Using the OpenAI adapter with a capturing fetch stub:

```js
import { OpenAISummarizer } from '../src/adapters/summarizer/openai.js';

test('summarizer prompt includes the summary-language instruction', async () => {
  let sentBody;
  const fetchImpl = async (_url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"tldr":"x"}' } }] }) };
  };
  const s = new OpenAISummarizer('m', 'http://x', 'k', fetchImpl);
  await s.summarize('hello transcript', { attendees: ['Sam'], summaryLanguage: 'de' });
  const prompt = sentBody.messages[0].content;
  assert.match(prompt, /Write the entire summary in German\./);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/summarizer-http.test.js`
Expected: FAIL — instruction not in prompt.

- [ ] **Step 3: Append the instruction in each adapter**

Add this import to all four adapter files (`gemini.js`, `openai.js`, `ollama.js`, `opencode.js`), alongside the existing `./notes.js` import:

```js
import { summaryLanguageInstruction } from './languages.js';
```

`src/adapters/summarizer/gemini.js` — replace the prompt line (26):

```js
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nMeeting: ${meta.channelName || ''} on ${meta.date || ''}\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
```

`src/adapters/summarizer/openai.js` — replace the prompt line (12):

```js
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
```

`src/adapters/summarizer/ollama.js` — replace the prompt line (11):

```js
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
```

`src/adapters/summarizer/opencode.js` — replace the prompt line (17):

```js
    const prompt = `${SUMMARY_PROMPT}${summaryLanguageInstruction(meta.summaryLanguage)}\n\nAttendees: ${(meta.attendees || []).join(', ')}\n\nTranscript:\n${transcript}`;
```

- [ ] **Step 4: Resolve + attach `summaryLanguage` on meta in the orchestrator**

In `src/pipeline/orchestrator.js`, add the import (after line 3):

```js
import { resolveSummaryLanguage } from '../adapters/summarizer/languages.js';
```

Replace the `meta` line (26):

```js
  const meta = {
    channelName: meeting.channel_name,
    date: meeting.started_at,
    attendees,
    summaryLanguage: resolveSummaryLanguage(opts.cfg),
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/summarizer-http.test.js test/orchestrator.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/orchestrator.js src/adapters/summarizer/*.js test/summarizer-http.test.js
git commit -m "feat: emit summary in the configured language"
```

---

### Task 7: Full suite + docs

**Files:**
- Modify: `CLAUDE.md` (optional note), `README` if it documents `/setup`.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS (all tests, including the new ones).

- [ ] **Step 2: Document the code-switching tip**

If the repo has a README section for `/setup`, add a line: for German+English meetings, set `language: German` to stop per-chunk auto-detect flip-flop; set `summary_language` to control the notes language (default English). If no such section exists, skip.

- [ ] **Step 3: Commit (if docs changed)**

```bash
git add -A
git commit -m "docs: note language + summary_language options in /setup"
```

---

## Self-review notes

- **Spec coverage:** pickers (Task 4), `summaryLanguage` config + migration (Task 2), validation (Task 3), prompt-instruction wiring with match/auto resolution (Tasks 1 & 6), interaction read (Task 5), tests in every task. All spec sections mapped.
- **Type consistency:** config field `summaryLanguage` / DB column `summary_language` / Discord option `summary_language` used consistently; helper names `resolveSummaryLanguage` / `summaryLanguageInstruction` / `LANGUAGE_CODES` / `SUMMARY_LANGUAGE_VALUES` / `LANGUAGES` match across tasks.
- **Default behavior:** unset/`en` → "Write the entire summary in English." (harmless, matches the English default). `match`+`auto` → "same language as the transcript."
