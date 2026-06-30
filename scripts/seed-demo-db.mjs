// Seed a clean, marketing-safe demo database for screenshots / the landing site
// and brag video. Uses the same store layer the app uses, so the real web UI
// renders against on-brand fictional data (no real client meetings).
//
//   node scripts/seed-demo-db.mjs [outPath]
//
// Default out: ./demo/meetings.db (created fresh each run).
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { openDb } from '../src/store/db.js';

const out = resolve(process.argv[2] || join(process.cwd(), 'demo', 'meetings.db'));
mkdirSync(dirname(out), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(out + suffix)) rmSync(out + suffix);
}

const db = openDb(out);

const GUILD = '900000000000000001';
db.upsertGuild(GUILD, 'Pixelforge');
db.sql.prepare(
  `INSERT OR REPLACE INTO guild_config
   (guild_id, summarizer_provider, summarizer_model, whisper_model, use_thread, auto_join, language, summary_language, stt_provider, stt_model)
   VALUES (?, 'gemini', 'gemini-2.5-flash', 'large-v3-turbo', 1, 1, 'en', 'en', 'local', 'large-v3-turbo')`
).run(GUILD);

// Fictional gaming studio cast — original handles, no trademarks.
const cast = {
  PixelPaladin: { id: 'u_pp', name: 'PixelPaladin' },
  RespawnRita: { id: 'u_rr', name: 'RespawnRita' },
  LootGoblin: { id: 'u_lg', name: 'LootGoblin' },
  NoScopeNova: { id: 'u_nn', name: 'NoScopeNova' },
  ByteBard: { id: 'u_bb', name: 'ByteBard' },
};

const wordsFor = (ms) => Math.round((ms / 1000) * 2.6); // ~156 wpm

function talktime(rows) {
  const total = rows.reduce((s, r) => s + r.ms, 0);
  return rows.map((r) => ({ displayName: r.name, ms: r.ms, words: wordsFor(r.ms), pct: Math.round((r.ms / total) * 100) }));
}

// A meeting: channel, day offset, duration, transcript beats, notes, talktime, todos.
const meetings = [
  {
    channel: 'launch-week',
    daysAgo: 0, startHour: 10, minutes: 14,
    attendees: ['PixelPaladin', 'RespawnRita', 'LootGoblin', 'NoScopeNova'],
    beats: [
      ['PixelPaladin', 'Build is green on main. The frame pacing fix is in.'],
      ['RespawnRita', 'Save corruption bug is fixed, but co-op still desyncs on level 3.'],
      ['LootGoblin', 'What if we add one more boss before launch?'],
      ['PixelPaladin', 'No. We freeze scope today or we miss Friday.'],
      ['NoScopeNova', 'Trailer drops Wednesday and wishlists are climbing fast.'],
      ['RespawnRita', 'Then co-op has to be cut or delayed, it is not stable yet.'],
      ['PixelPaladin', 'Agreed. We ship solo Friday and co-op lands as a week-1 patch.'],
    ],
    notes: {
      tldr: 'Pixelforge ships solo mode this Friday. Co-op is cut from launch and moves to a week-1 patch after a level-3 desync. The trailer goes live Wednesday.',
      topics: [
        { title: 'Launch readiness', points: ['Main build is green with the frame-pacing fix merged.', 'Save-corruption bug is resolved and verified.'] },
        { title: 'Co-op stability', points: ['Co-op desyncs on level 3 and is not launch-stable.', 'Decision: cut co-op from v1, ship as a week-1 patch.'] },
        { title: 'Marketing', points: ['Trailer goes live Wednesday.', 'Wishlist numbers are climbing ahead of launch.'] },
      ],
      decisions: ['Launch date locked: Friday.', 'Co-op cut from v1, ships as a week-1 patch.', 'Scope frozen as of today, no new content.'],
      openQuestions: ['Do we gate co-op behind a beta flag for the patch?'],
      actionItems: [
        { assignee: 'PixelPaladin', task: 'Tag the release branch and freeze scope' },
        { assignee: 'PixelPaladin', task: 'Write the week-1 co-op patch plan' },
        { assignee: 'RespawnRita', task: 'File the level-3 desync repro' },
        { assignee: 'RespawnRita', task: 'Sign off on the solo-mode build' },
        { assignee: 'LootGoblin', task: 'Shelve the extra-boss design doc for v1.1' },
        { assignee: 'NoScopeNova', task: 'Schedule the trailer for Wednesday' },
      ],
    },
    talk: [['PixelPaladin', 330000], ['RespawnRita', 234000], ['NoScopeNova', 174000], ['LootGoblin', 130000]],
    doneTodos: 4,
  },
  {
    channel: 'standup',
    daysAgo: 1, startHour: 9, minutes: 11,
    attendees: ['PixelPaladin', 'ByteBard', 'LootGoblin'],
    beats: [
      ['ByteBard', 'Netcode rollback is landing today, latency feels way better.'],
      ['LootGoblin', 'New boss arena art is in, just needs lighting passes.'],
      ['PixelPaladin', 'Keep the lighting cheap, we are not reopening scope.'],
      ['ByteBard', 'Understood. I will profile the rollback on the Steam Deck build.'],
    ],
    notes: {
      tldr: 'Netcode rollback ships today and noticeably cuts latency. Boss arena art is in and needs a lighting pass kept within the frozen scope.',
      topics: [
        { title: 'Netcode', points: ['Rollback networking lands today.', 'Latency is materially improved in testing.'] },
        { title: 'Art', points: ['Boss arena art is complete.', 'Needs a cheap lighting pass only.'] },
      ],
      decisions: ['Rollback netcode ships today.', 'Lighting work stays inside frozen scope.'],
      openQuestions: [],
      actionItems: [
        { assignee: 'ByteBard', task: 'Profile rollback netcode on the Steam Deck build' },
        { assignee: 'LootGoblin', task: 'Do a cheap lighting pass on the boss arena' },
      ],
    },
    talk: [['ByteBard', 280000], ['LootGoblin', 210000], ['PixelPaladin', 170000]],
    doneTodos: 2,
  },
  {
    channel: 'retro',
    daysAgo: 4, startHour: 15, minutes: 38,
    attendees: ['PixelPaladin', 'RespawnRita', 'NoScopeNova', 'ByteBard', 'LootGoblin'],
    beats: [
      ['NoScopeNova', 'The demo weekend drove a record number of wishlists.'],
      ['RespawnRita', 'QA caught the input lag regression before it shipped, good catch.'],
      ['ByteBard', 'We should keep the nightly perf budget gate, it paid off.'],
      ['PixelPaladin', 'Agreed. Let us make the perf gate a hard CI check.'],
    ],
    notes: {
      tldr: 'Sprint retro: the demo weekend set a wishlist record, QA caught an input-lag regression early, and the team will make the nightly perf budget a hard CI gate.',
      topics: [
        { title: 'Wins', points: ['Demo weekend set a wishlist record.', 'QA caught an input-lag regression pre-ship.'] },
        { title: 'Process', points: ['Nightly perf budget gate proved valuable.', 'Promote it to a hard CI check.'] },
      ],
      decisions: ['Make the nightly perf budget a hard CI gate.'],
      openQuestions: ['Who owns the CI gate config?'],
      actionItems: [
        { assignee: 'ByteBard', task: 'Promote the perf budget to a blocking CI check' },
        { assignee: 'NoScopeNova', task: 'Write the demo-weekend wishlist recap post' },
        { assignee: 'RespawnRita', task: 'Add the input-lag regression to the smoke suite' },
      ],
    },
    talk: [['NoScopeNova', 520000], ['RespawnRita', 470000], ['ByteBard', 430000], ['PixelPaladin', 360000], ['LootGoblin', 300000]],
    doneTodos: 1,
  },
  {
    channel: 'design-review',
    daysAgo: 6, startHour: 13, minutes: 26,
    attendees: ['LootGoblin', 'PixelPaladin', 'NoScopeNova'],
    beats: [
      ['LootGoblin', 'The new HUD is cleaner, the minimap moved to the corner.'],
      ['NoScopeNova', 'Streamers will love that, less clutter on capture.'],
      ['PixelPaladin', 'Ship it after launch, it is a v1.1 polish item.'],
    ],
    notes: {
      tldr: 'HUD redesign declutters the screen and moves the minimap to the corner. It is approved as a post-launch v1.1 polish item.',
      topics: [{ title: 'HUD', points: ['Minimap moves to the corner.', 'Less clutter for streamer capture.'] }],
      decisions: ['HUD redesign ships in v1.1, not at launch.'],
      openQuestions: [],
      actionItems: [
        { assignee: 'LootGoblin', task: 'Finalize HUD mockups for v1.1' },
        { assignee: 'NoScopeNova', task: 'Loop in partnered streamers on the HUD change' },
      ],
    },
    talk: [['LootGoblin', 360000], ['NoScopeNova', 240000], ['PixelPaladin', 180000]],
    doneTodos: 2,
  },
  {
    channel: 'standup',
    daysAgo: 7, startHour: 9, minutes: 9,
    attendees: ['PixelPaladin', 'RespawnRita', 'ByteBard'],
    beats: [
      ['RespawnRita', 'Crash rate is down to 0.2 percent on the release candidate.'],
      ['ByteBard', 'Memory leak in the audio mixer is patched.'],
      ['PixelPaladin', 'Great. Lock the RC and start the cert checklist.'],
    ],
    notes: {
      tldr: 'Release candidate crash rate is down to 0.2 percent and the audio mixer leak is patched. The team locks the RC and begins the cert checklist.',
      topics: [{ title: 'Stability', points: ['Crash rate at 0.2% on the RC.', 'Audio mixer memory leak patched.'] }],
      decisions: ['Lock the release candidate.', 'Begin the certification checklist.'],
      openQuestions: [],
      actionItems: [
        { assignee: 'RespawnRita', task: 'Run the full cert checklist on the locked RC' },
        { assignee: 'ByteBard', task: 'Add an audio-mixer leak regression test' },
      ],
    },
    talk: [['RespawnRita', 250000], ['ByteBard', 220000], ['PixelPaladin', 150000]],
    doneTodos: 2,
  },
  {
    channel: 'launch-week',
    daysAgo: 11, startHour: 11, minutes: 31,
    attendees: ['PixelPaladin', 'NoScopeNova', 'RespawnRita', 'ByteBard'],
    beats: [
      ['NoScopeNova', 'Press embargo lifts the morning of launch day.'],
      ['PixelPaladin', 'Day-one patch needs to be in cert by Tuesday then.'],
      ['ByteBard', 'It will be. The patch is just the co-op flag and two crash fixes.'],
      ['RespawnRita', 'I will smoke-test the day-one patch end to end.'],
    ],
    notes: {
      tldr: 'Press embargo lifts on launch morning, so the day-one patch must clear cert by Tuesday. The patch is scoped to the co-op flag plus two crash fixes.',
      topics: [
        { title: 'PR', points: ['Embargo lifts launch morning.'] },
        { title: 'Day-one patch', points: ['Co-op flag plus two crash fixes.', 'Must clear cert by Tuesday.'] },
      ],
      decisions: ['Day-one patch scope frozen to co-op flag and two crash fixes.'],
      openQuestions: ['Do we need a backup cert slot?'],
      actionItems: [
        { assignee: 'ByteBard', task: 'Submit the day-one patch to cert by Tuesday' },
        { assignee: 'RespawnRita', task: 'Smoke-test the day-one patch end to end' },
        { assignee: 'NoScopeNova', task: 'Send the embargo schedule to press contacts' },
      ],
    },
    talk: [['NoScopeNova', 410000], ['PixelPaladin', 360000], ['ByteBard', 330000], ['RespawnRita', 300000]],
    doneTodos: 1,
  },
];

const pad = (n) => String(n).padStart(2, '0');
function tsFor(daysAgo, hour, min = 0, sec = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, sec, 0);
  // store as ISO-ish local "YYYY-MM-DD HH:MM:SS" (matches existing rows)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let created = 0;
for (const m of meetings) {
  const startedAt = tsFor(m.daysAgo, m.startHour);
  const endedAt = tsFor(m.daysAgo, m.startHour, m.minutes);
  const id = db.createMeeting({ guildId: GUILD, channelId: 'c_' + m.channel, channelName: m.channel, startedAt });
  for (const h of m.attendees) db.addAttendee(id, cast[h].id, cast[h].name);
  let t = 1500;
  for (const [h, text] of m.beats) {
    const dur = 2200 + text.length * 45;
    db.addUtterance({ meetingId: id, userId: cast[h].id, displayName: cast[h].name, startMs: t, endMs: t + dur, text });
    t += dur + 700;
  }
  const tt = talktime(m.talk.map(([h, ms]) => ({ name: cast[h].name, ms })));
  db.saveSummary(id, m.notes, tt, 'gemini:gemini-2.5-flash', endedAt);
  db.setMeetingStatus(id, 'done', endedAt);
  const n = db.seedTodos(id, GUILD, m.notes.actionItems, endedAt);
  // Mark the first `doneTodos` as completed for a realistic open/closed mix.
  const todoRows = db.sql.prepare(`SELECT id FROM todos WHERE meeting_id = ? ORDER BY id`).all(id);
  for (let i = 0; i < Math.min(m.doneTodos || 0, todoRows.length); i++) {
    db.sql.prepare(`UPDATE todos SET done = 1 WHERE id = ?`).run(todoRows[i].id);
  }
  created++;
}

const stats = db.guildStats(GUILD);
console.log(`Seeded ${created} meetings into ${out}`);
console.log(`  people=${stats.people} todos open=${stats.todos.open}/${stats.todos.total} utterances=${stats.totalUtterances}`);
