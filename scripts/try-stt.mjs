#!/usr/bin/env node
// Live smoke-test for the speech-to-text adapters. Transcribes a real audio
// file through any configured provider and prints the result + timing.
//
//   node scripts/try-stt.mjs --provider openai [--model whisper-1] [--file path] [--language auto]
//   node scripts/try-stt.mjs --provider sidecar --model small --file audio/3/<id>.pcm
//
// With no --file it auto-picks the first .pcm under ./audio. Reads keys/urls
// from your .env (OPENAI_API_KEY, STT_URL). Accepts .pcm (16k
// mono s16le, converted to wav on the fly) or any audio file the provider takes.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../src/config/env.js';
import { getSTT, resolveSttModel, sttProviderReady, STT_MODELS } from '../src/adapters/stt/index.js';
import { convertPcmToWav } from '../src/voice/audio.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function firstPcm(dir = 'audio') {
  if (!existsSync(dir)) return null;
  for (const g of readdirSync(dir)) {
    const sub = join(dir, g);
    if (!statSync(sub).isDirectory()) continue;
    const pcm = readdirSync(sub).find((f) => f.endsWith('.pcm'));
    if (pcm) return join(sub, pcm);
  }
  return null;
}

const provider = arg('provider', 'sidecar');
const language = arg('language', 'auto');
let file = arg('file', null) || firstPcm();

if (!file) {
  console.error('No audio file. Pass --file <path> or record a meeting first.');
  process.exit(1);
}
if (!STT_MODELS[provider]) {
  console.error(`Unknown provider "${provider}". Use one of: ${Object.keys(STT_MODELS).join(', ')}.`);
  process.exit(1);
}
const ready = sttProviderReady(provider, config);
if (!ready.ok) {
  console.error(`Provider "${provider}" is not ready: ${ready.missing} is not set in .env.`);
  process.exit(1);
}

const cfg = { sttProvider: provider, language };
const model = arg('model', null);
if (model) { if (provider === 'sidecar') cfg.whisperModel = model; else cfg.sttModel = model; }
const resolved = resolveSttModel(cfg);

console.log(`Provider : ${provider}`);
console.log(`Model    : ${resolved}`);
console.log(`Language : ${language}`);
console.log(`File     : ${file}`);

// Convert raw PCM turns to wav; everything else is sent as-is.
let wav = file;
let cleanup = null;
if (file.endsWith('.pcm')) {
  wav = join(tmpdir(), `parley-stt-${Date.now()}.wav`);
  await convertPcmToWav(file, wav);
  cleanup = wav;
}

const transcribe = getSTT(cfg, config);
const t0 = performance.now();
try {
  const out = await transcribe(wav, { model: resolved, language });
  const ms = Math.round(performance.now() - t0);
  console.log(`\n⏱  ${ms} ms`);
  console.log(`🌍 detected language: ${out.language ?? 'n/a'}`);
  console.log(`📝 words: ${out.words?.length ?? 0}`);
  console.log(`\n"${out.text}"\n`);
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  process.exitCode = 1;
} finally {
  if (cleanup) { const { unlink } = await import('node:fs/promises'); await unlink(cleanup).catch(() => {}); }
}
