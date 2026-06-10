// Re-run the FULL pipeline for a meeting from its saved PCM tracks on disk:
// transcribe each track via the STT sidecar, store utterances, summarize, save.
// Use when status is transcription_failed (e.g. the sidecar was down) but the
// audio/<meetingId>/*.pcm files are still present.
//
//   node scripts/retranscribe-meeting.mjs <meetingId>
//
// Requires the STT sidecar running (npm run sidecar). Refuses if the meeting
// already has stored utterances, since the FTS index has no delete trigger and
// re-inserting would duplicate/ desync it — use reprocess-meeting.mjs for the
// summary-only case instead.
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { config } from '../src/config/env.js';
import { openDb } from '../src/store/db.js';
import { getGuildConfig } from '../src/store/config.js';
import { parsePcmName } from '../src/voice/audio.js';
import { processMeeting } from '../src/pipeline/orchestrator.js';
import { describeSummarizerError } from '../src/adapters/summarizer/errors.js';

const meetingId = Number(process.argv[2]);
if (!Number.isInteger(meetingId)) {
  console.error('Usage: node scripts/retranscribe-meeting.mjs <meetingId>');
  process.exit(1);
}

const db = openDb(join(config.dataDir, 'meetings.db'));
const meeting = db.getMeeting(meetingId);
if (!meeting) {
  console.error(`Meeting ${meetingId} not found.`);
  process.exit(1);
}

const existing = db.listUtterances(meetingId).length;
if (existing > 0) {
  console.error(`Meeting ${meetingId} already has ${existing} utterances. Re-transcribing would duplicate the FTS index. Use scripts/reprocess-meeting.mjs ${meetingId} to redo only the summary.`);
  process.exit(1);
}

const audioDir = join(config.dataDir, 'audio', String(meetingId));
let files;
try {
  files = readdirSync(audioDir).filter((f) => f.endsWith('.pcm'));
} catch {
  console.error(`No audio directory at ${audioDir}. The PCM tracks are gone — cannot re-transcribe.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`No .pcm files in ${audioDir} — nothing to transcribe.`);
  process.exit(1);
}

// Map userId -> display name from the recorded attendees; fall back to the id.
const nameById = new Map(db.listAttendees(meetingId).map((a) => [a.user_id, a.display_name]));

// Rebuild tracks (the same shape capture.js produces) from the filenames.
const tracks = files
  .map((f) => {
    const { userId, startMs } = parsePcmName(f);
    return { userId, displayName: nameById.get(userId) || userId, startMs, pcmPath: join(audioDir, f) };
  })
  .sort((a, b) => a.startMs - b.startMs);

const cfg = getGuildConfig(db, meeting.guild_id);
console.log(`Re-transcribing meeting ${meetingId}: ${tracks.length} tracks via sidecar (${config.sttUrl}, whisper=${cfg.whisperModel}), summarizer ${cfg.summarizerProvider}:${cfg.summarizerModel || ''}...`);

try {
  const { notes } = await processMeeting(db, meetingId, { tracks, cfg });
  console.log(`Done. Meeting ${meetingId} status -> done. View with /summary.`);
  console.log(`TL;DR: ${notes.tldr}`);
} catch (err) {
  // processMeeting sets the right status (transcription_failed / summary_failed)
  // and attaches a user-facing reason.
  const reason = err.userMessage || describeSummarizerError(err, cfg.summarizerProvider);
  console.error(`Reprocess failed (${db.getMeeting(meetingId).status}): ${reason}`);
  process.exit(1);
}
