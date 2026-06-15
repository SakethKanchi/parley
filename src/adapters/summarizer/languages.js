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
