// src/web/api.js
import { Router } from 'express';
import { ChannelType } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../store/config.js';
import { validateSetup, availableProviders } from '../commands/setup-logic.js';
import { config as env } from '../config/env.js';

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

  r.get('/guilds/:g/todos', (req, res) => {
    res.json(db.listTodos(req.params.g, { open: req.query.open === '1' }));
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

  return r;
}
