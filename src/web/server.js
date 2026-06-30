// src/web/server.js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { apiRouter } from './api.js';
import { installUsers } from '../store/users.js';
import { authRouter, attachUser, requireAuth } from './auth.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createWebServer({ db, bot = null, client = null, sidecar = null }) {
  const app = express();
  // Honor X-Forwarded-Proto so secure cookies work behind a reverse proxy.
  app.set('trust proxy', true);
  app.use(express.json());

  // Auth: seed users (default admin on first run) and resolve the session
  // cookie for every request. Login/logout/me are public; everything else under
  // /api needs a session.
  const users = installUsers(db);
  app.use(attachUser(users));
  app.use('/api', authRouter({ users }));
  app.use('/api', requireAuth(users), apiRouter({ db, bot, client, sidecar }));

  if (existsSync(DIST)) {
    app.use(express.static(DIST));
    // SPA fallback for client-side routes (but never /api)
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
  }
  return app;
}

export function startWebServer({ db, bot = null, client = null, sidecar = null, port = 3000, host = process.env.WEB_UI_HOST || '127.0.0.1' }) {
  db.backfillTodos();
  const app = createWebServer({ db, bot, client, sidecar });
  return app.listen(port, host);
}
