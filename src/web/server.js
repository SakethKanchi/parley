// src/web/server.js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { apiRouter } from './api.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createWebServer({ db, bot = null, client = null, sidecar = null }) {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, bot, client, sidecar }));

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
