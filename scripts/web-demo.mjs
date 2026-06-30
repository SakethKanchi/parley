// Standalone web server bound to the seeded demo DB (marketing screenshots).
import { join } from 'node:path';
import { openDb } from '../src/store/db.js';
import { startWebServer } from '../src/web/server.js';
const dbPath = process.argv[2] || join(process.cwd(), 'demo', 'meetings.db');
const port = Number(process.env.WEB_UI_PORT) || 3100;
const db = openDb(dbPath);
startWebServer({ db, bot: null, client: null, port });
console.log(`[web:demo] API + UI on http://127.0.0.1:${port} (db: ${dbPath})`);
