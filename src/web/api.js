// src/web/api.js
import { Router } from 'express';
import { ChannelType } from 'discord.js';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getGuildConfig, setGuildConfig } from '../store/config.js';
import { validateSetup, availableProviders } from '../commands/setup-logic.js';
import { config as env } from '../config/env.js';
import { askMeeting } from '../adapters/summarizer/ask.js';
import { getSummarizer } from '../adapters/summarizer/index.js';
import { buildTranscript, computeTalkTime } from '../pipeline/summarize.js';
import { resolveSummaryLanguage } from '../adapters/summarizer/languages.js';

function audioDir(id) {
  return join(env.dataDir, 'audio', String(id));
}

function guildName(client, id) {
  return client?.guilds?.cache?.get(id)?.name || id;
}

export function apiRouter({ db, client }) {
  const r = Router();

  r.get('/guilds', (_req, res) => {
    const fromDb = db.listGuilds().map(({ guild_id }) => guild_id);
    const fromCache = client ? [...client.guilds.cache.values()].map((g) => g.id) : [];
    const allIds = [...new Set([...fromDb, ...fromCache])];
    res.json(allIds.map((id) => ({ id, name: guildName(client, id) })));
  });

  r.get('/guilds/:g/meetings', (req, res) => {
    res.json(db.listRecent(req.params.g, 50));
  });

  r.get('/meetings/:id', (req, res) => {
    const id = Number(req.params.id);
    const meeting = db.getMeeting(id);
    if (!meeting) return res.status(404).json({ error: 'meeting not found' });
    res.json({
      meeting,
      summary: db.getSummary(id),
      attendees: db.listAttendees(id),
      utterances: db.listUtterances(id),
    });
  });

  r.delete('/meetings/:id', async (req, res) => {
    const id = Number(req.params.id);
    const meeting = db.getMeeting(id);
    if (!meeting) return res.status(404).json({ error: 'meeting not found' });
    db.deleteMeeting(id);
    await rm(audioDir(id), { recursive: true, force: true }).catch(() => {});
    res.json({ ok: true });
  });

  // Merge sourceIds into the target meeting, then re-summarize the combined
  // transcript. Sources must share the target's guild.
  r.post('/meetings/:id/merge', async (req, res) => {
    const targetId = Number(req.params.id);
    const target = db.getMeeting(targetId);
    if (!target) return res.status(404).json({ error: 'meeting not found' });
    const sourceIds = (Array.isArray(req.body?.sourceIds) ? req.body.sourceIds : [])
      .map(Number).filter((s) => s && s !== targetId);
    if (sourceIds.length === 0) return res.status(400).json({ error: 'sourceIds required' });
    for (const sid of sourceIds) {
      const m = db.getMeeting(sid);
      if (!m) return res.status(404).json({ error: `meeting ${sid} not found` });
      if (m.guild_id !== target.guild_id) return res.status(400).json({ error: 'meetings belong to different guilds' });
    }

    const merged = db.mergeMeetings(targetId, sourceIds);

    // Re-summarize the now-combined transcript and replace the target's notes.
    const utterances = db.listUtterances(targetId).map((u) => ({
      displayName: u.display_name, userId: u.user_id, text: u.text,
      startMs: u.start_ms, endMs: u.end_ms,
    }));
    const cfg = getGuildConfig(db, target.guild_id);
    const transcript = buildTranscript(utterances);
    const talktime = computeTalkTime(utterances);
    const meta = {
      channelName: target.channel_name, date: target.started_at,
      attendees: db.listAttendees(targetId).map((a) => a.display_name),
      summaryLanguage: resolveSummaryLanguage(cfg),
    };
    try {
      const notes = await getSummarizer(cfg).summarize(transcript, meta);
      db.clearSummary(targetId);
      db.saveSummary(targetId, notes, talktime, `${cfg.summarizerProvider}:${cfg.summarizerModel || ''}`);
      db.seedTodos(targetId, target.guild_id, notes.actionItems || []);
    } catch (e) {
      // Data is already merged; surface the summarize failure but don't unwind.
      return res.status(502).json({ error: e.message, merged });
    }
    for (const sid of merged) await rm(audioDir(sid), { recursive: true, force: true }).catch(() => {});
    res.json({ ok: true, merged });
  });

  r.get('/guilds/:g/todos', (req, res) => {
    const { open, assignee } = req.query;
    const opts = { open: open === '1' };
    if (assignee !== undefined) opts.assignee = assignee === '__unassigned__' ? null : assignee;
    res.json(db.listTodos(req.params.g, opts));
  });

  r.get('/guilds/:g/assignees', (req, res) => {
    res.json(db.listAssignees(req.params.g));
  });

  r.patch('/todos/:id', (req, res) => {
    db.setTodoDone(Number(req.params.id), !!req.body.done);
    res.json({ ok: true });
  });

  r.get('/guilds/:g/search', (req, res) => {
    const q = (req.query.q || '').trim();
    res.json(q ? db.searchUtterances(req.params.g, q) : []);
  });

  r.get('/guilds/:g/config', (req, res) => {
    const guild = client?.guilds?.cache?.get(req.params.g);
    const channels = guild
      ? [...guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values()]
          .map((c) => ({ id: c.id, name: c.name }))
      : [];
    res.json({
      config: getGuildConfig(db, req.params.g),
      providers: availableProviders(env),
      channels,
    });
  });

  r.patch('/guilds/:g/config', (req, res) => {
    const result = validateSetup(req.body, env);
    if (!result.ok) return res.status(400).json({ error: result.error });
    const config = setGuildConfig(db, req.params.g, result.patch);
    res.json({ ok: true, config });
  });

  r.post('/guilds/:g/meetings/:id/ask', async (req, res) => {
    const id = Number(req.params.id);
    const meeting = db.getMeeting(id);
    if (!meeting) return res.status(404).json({ error: 'meeting not found' });
    const question = (req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'question required' });
    const transcript = db.listUtterances(id).map((u) => `${u.display_name}: ${u.text}`).join('\n');
    try {
      const answer = await askMeeting({
        cfg: getGuildConfig(db, meeting.guild_id), env, question, transcript,
        meta: { channelName: meeting.channel_name, date: meeting.started_at,
          attendees: db.listAttendees(id).map((a) => a.display_name) },
      });
      res.json({ answer });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  return r;
}
