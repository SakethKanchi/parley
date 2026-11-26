#!/usr/bin/env node
// Import transcripts from markdown files into Parley's SQLite database

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = process.argv[2] || '/data/meetings.db';
const transcriptFile = process.argv[3];

if (!transcriptFile) {
  console.error('Usage: node import-transcripts.js [db-path] <transcript-file>');
  process.exit(1);
}

function parseTranscript(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  
  // Extract header: "# The Party's Campfire — 2026-08-29"
  const titleMatch = content.match(/^# (.+?) — (\d{4}-\d{2}-\d{2})/m);
  if (!titleMatch) throw new Error('Could not parse title/date from transcript');
  
  const channelName = titleMatch[1].trim();
  const dateStr = titleMatch[2];
  
  // Extract attendees: "**Attendees:** user1, user2, ..."
  const attendeesMatch = content.match(/\*\*Attendees:\*\* (.+?)(\n|$)/);
  if (!attendeesMatch) throw new Error('Could not parse attendees');
  
  const attendees = attendeesMatch[1].split(',').map(a => a.trim());
  
  // Extract utterances: "**[timestamp] Speaker:** text"
  // Timestamps are in format [29800546:31] = milliseconds
  const utteranceMatches = [...content.matchAll(/\*\*\[(\d+):(\d+)\] ([^:]+):\*\* ([^\n]*)/g)];
  
  const utterances = utteranceMatches.map(match => {
    const ms1 = parseInt(match[1]);
    const ms2 = parseInt(match[2]);
    const speaker = match[3].trim();
    const text = match[4].trim();
    return { speaker, text, startMs: ms1 * 1000 + ms2 };
  });
  
  // Extract talk time stats if present
  const talkTimeMatch = content.match(/## Talk Time([\s\S]*?)(?=##|$)/);
  const talkTime = {};
  if (talkTimeMatch) {
    const lines = talkTimeMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/- ([^:]+): (\d+)%/);
      if (match) {
        talkTime[match[1].trim()] = parseInt(match[2]);
      }
    }
  }
  
  return {
    channelName,
    dateStr,
    startedAt: new Date(`${dateStr}T19:00:00Z`).toISOString(), // assume 7pm start
    attendees,
    utterances,
    talkTime
  };
}

function importTranscript(dbPath, transcript) {
  const db = new DatabaseSync(dbPath);
  
  // Create meeting
  const meetingResult = db.prepare(
    `INSERT INTO meetings (guild_id, channel_id, channel_name, started_at, ended_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('discord-guild', 'discord-channel', transcript.channelName, transcript.startedAt, null, 'done');
  
  const meetingId = meetingResult.lastInsertRowid;
  
  // Add attendees
  const addAttendee = db.prepare(
    `INSERT OR IGNORE INTO attendees (meeting_id, user_id, display_name)
     VALUES (?, ?, ?)`
  );
  
  for (const attendee of transcript.attendees) {
    addAttendee.run(meetingId, attendee, attendee);
  }
  
  // Add utterances
  const addUtterance = db.prepare(
    `INSERT INTO utterances (meeting_id, user_id, display_name, start_ms, end_ms, text)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  
  for (let i = 0; i < transcript.utterances.length; i++) {
    const u = transcript.utterances[i];
    const nextU = transcript.utterances[i + 1];
    const endMs = nextU ? nextU.startMs : u.startMs + 5000;
    
    addUtterance.run(meetingId, u.speaker, u.speaker, u.startMs, endMs, u.text);
  }
  
  // Add summary with talk time if available
  if (Object.keys(transcript.talkTime).length > 0) {
    db.prepare(
      `INSERT INTO summaries (meeting_id, talktime_json, created_at)
       VALUES (?, ?, ?)`
    ).run(meetingId, JSON.stringify(transcript.talkTime), new Date().toISOString());
  }
  
  console.log(`✓ Imported meeting "${transcript.channelName}" (${transcript.utterances.length} utterances, ${transcript.attendees.length} attendees)`);
  return meetingId;
}

try {
  const transcript = parseTranscript(transcriptFile);
  const meetingId = importTranscript(dbPath, transcript);
  console.log(`✓ Meeting ID: ${meetingId}`);
} catch (err) {
  console.error(`✗ Error: ${err.message}`);
  process.exit(1);
}
