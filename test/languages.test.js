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
