import { stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

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

// The captured PCM is always s16le/16kHz/mono, so a valid WAV is just this
// 44-byte RIFF/fmt/data header followed by the raw PCM bytes — no ffmpeg needed.
const CHANNELS = 1;
const SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const BLOCK_ALIGN = (CHANNELS * BITS_PER_SAMPLE) / 8; // 2
const BYTE_RATE = SAMPLE_RATE * BLOCK_ALIGN; // 32000

// Recorded tracks have a fixed PCM format, so their size gives their duration
// even when a transcription model returns text without timestamps.
export async function getPcmDurationMs(pcmPath) {
  const { size } = await stat(pcmPath);
  return (size / BYTE_RATE) * 1000;
}

export function wavHeader(dataLength) {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataLength, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  buf.writeUInt16LE(1, 20); // audio format: 1 = PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(BYTE_RATE, 28);
  buf.writeUInt16LE(BLOCK_ALIGN, 32);
  buf.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataLength, 40);
  return buf;
}

// Stream the PCM into the WAV instead of buffering the whole track in memory.
// The header needs the data length up front, which we get from stat() (the PCM
// is already fully written on disk by capture). A long uninterrupted speaking
// turn can be 100+ MB; the old readFile + Buffer.concat held ~2x that in RAM.
export async function convertPcmToWav(pcmPath, wavPath) {
  const { size } = await stat(pcmPath);
  const out = createWriteStream(wavPath);
  // Concatenate the header stream and the PCM file stream into the WAV. pipeline
  // wires up backpressure, waits for the full flush, and propagates any error
  // (and destroys the streams) so there are no dangling handles or rejections.
  const header = Readable.from([wavHeader(size)]);
  await pipeline(
    async function* () {
      yield* header;
      yield* createReadStream(pcmPath);
    },
    out,
  );
  return wavPath;
}
