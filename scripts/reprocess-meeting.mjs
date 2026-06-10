// Re-summarize a meeting from its already-stored utterances.
// Use when status is summary_failed (e.g. a transient Gemini 503) but the
// transcript is intact — skips transcription and the STT sidecar entirely.
//
//   node scripts/reprocess-meeting.mjs <meetingId>
//
// Saves the summary and flips status to 'done'. Discord delivery is NOT done
// here (that needs a logged-in client); the notes appear via /summary.
import { join } from 'node:path';
import { config } from '../src/config/env.js';
import { openDb } from '../src/store/db.js';
import { getGuildConfig } from '../src/store/config.js';
import { buildTranscript, computeTalkTime } from '../src/pipeline/summarize.js';
import { getSummarizer } from '../src/adapters/summarizer/index.js';
import { describeSummarizerError } from '../src/adapters/summarizer/errors.js';

const meetingId = Number(process.argv[2]);
if (!Number.isInteger(meetingId)) {
  console.error('Usage: node scripts/reprocess-meeting.mjs <meetingId>');
  process.exit(1);
}

const db = openDb(join(config.dataDir, 'meetings.db'));
const meeting = db.getMeeting(meetingId);
if (!meeting) {
  console.error(`Meeting ${meetingId} not found.`);
  process.exit(1);
}

// listUtterances returns DB rows (snake_case); the pipeline expects camelCase.
const utterances = db.listUtterances(meetingId).map((u) => ({
  userId: u.user_id,
  displayName: u.display_name,
  startMs: u.start_ms,
  endMs: u.end_ms,
  text: u.text,
}));
if (utterances.length === 0) {
  console.error(`Meeting ${meetingId} has no stored utterances — nothing to summarize.`);
  process.exit(1);
}

const cfg = getGuildConfig(db, meeting.guild_id);
const transcript = buildTranscript(utterances);
const talktime = computeTalkTime(utterances);
const attendees = db.listAttendees(meetingId).map((a) => a.display_name);
const meta = { channelName: meeting.channel_name, date: meeting.started_at, attendees };

console.log(`Reprocessing meeting ${meetingId} (${utterances.length} utterances) via ${cfg.summarizerProvider}:${cfg.summarizerModel}...`);

const summarizer = getSummarizer(cfg);
let notes;
try {
  notes = await summarizer.summarize(transcript, meta);
} catch (err) {
  console.error(`Reprocess failed: ${describeSummarizerError(err, cfg.summarizerProvider)}`);
  process.exit(1);
}
const modelUsed = `${cfg.summarizerProvider}:${cfg.summarizerModel || ''}`;
db.saveSummary(meetingId, notes, talktime, modelUsed);
db.setMeetingStatus(meetingId, 'done', new Date().toISOString());

console.log(`Done. Meeting ${meetingId} status -> done. View with /summary.`);
console.log(`TL;DR: ${notes.tldr}`);
