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
