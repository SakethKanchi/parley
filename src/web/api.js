// src/web/api.js
import { Router } from 'express';

function guildName(client, id) {
  return client?.guilds?.cache?.get(id)?.name || id;
}

export function apiRouter({ db, client }) {
  const r = Router();

  r.get('/guilds', (_req, res) => {
    res.json(db.listGuilds().map(({ guild_id }) => ({ id: guild_id, name: guildName(client, guild_id) })));
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

  return r;
}
