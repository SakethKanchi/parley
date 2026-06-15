import { transcribeTracks } from './transcribe.js';
import { buildTranscript, computeTalkTime } from './summarize.js';
import { getSummarizer } from '../adapters/summarizer/index.js';
import { describeSummarizerError } from '../adapters/summarizer/errors.js';
import { resolveSummaryLanguage } from '../adapters/summarizer/languages.js';

export async function processMeeting(db, meetingId, opts) {
  const meeting = db.getMeeting(meetingId);
  const transcribe = opts.transcribe || ((tracks, cfg) => transcribeTracks(tracks, cfg));
  const summarizer = opts.summarizer || getSummarizer(opts.cfg);

  db.setMeetingStatus(meetingId, 'processing');

  let utterances;
  try {
    utterances = await transcribe(opts.tracks, opts.cfg);
  } catch (err) {
    db.setMeetingStatus(meetingId, 'transcription_failed');
    err.userMessage = `Transcription failed — the STT sidecar may be down or unreachable. (${err.message})`;
    throw err;
  }
  for (const u of utterances) db.addUtterance({ meetingId, ...u });

  const transcript = buildTranscript(utterances);
  const talktime = computeTalkTime(utterances);
  const attendees = db.listAttendees(meetingId).map((a) => a.display_name);
  const meta = {
    channelName: meeting.channel_name,
    date: meeting.started_at,
    attendees,
    summaryLanguage: resolveSummaryLanguage(opts.cfg),
  };

  let notes;
  try {
    notes = await summarizer.summarize(transcript, meta);
  } catch (err) {
    db.setMeetingStatus(meetingId, 'summary_failed');
    err.userMessage = describeSummarizerError(err, opts.cfg.summarizerProvider);
    throw err;
  }

  const modelUsed = `${opts.cfg.summarizerProvider}:${opts.cfg.summarizerModel || ''}`;
  db.saveSummary(meetingId, notes, talktime, modelUsed);
  db.setMeetingStatus(meetingId, 'done', new Date().toISOString());

  if (opts.deliver) await opts.deliver(notes, talktime, meta);
  return { notes, talktime };
}
