// src/web/server.js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { apiRouter } from './api.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createWebServer({ db, client }) {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter({ db, client }));

  if (existsSync(DIST)) {
    app.use(express.static(DIST));
    // SPA fallback for client-side routes (but never /api)
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
  }
  return app;
}

export function startWebServer({ db, client, port = 3000 }) {
  db.backfillTodos();
  const app = createWebServer({ db, client });
  return app.listen(port, '127.0.0.1');
}
