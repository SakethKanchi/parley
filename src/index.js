// src/index.js
// Entrypoint. The web dashboard ALWAYS starts (so a fresh self-hoster can open
// it and paste their Discord credentials), and the bot starts as soon as creds
// are available — either from the environment now, or saved later via the UI.
import { join } from 'node:path';
import { config, hasDiscordCreds } from './config/env.js';
import { openDb } from './store/db.js';
import { BotController } from './bot-controller.js';
import { startWebServer } from './web/server.js';

const db = openDb(join(config.dataDir, 'meetings.db'));
const audioRoot = join(config.dataDir, 'audio');

const bot = new BotController({ db, audioRoot });

// The web UI is on by default in a hosted/container deploy. Set WEB_UI=0 to run
// headless (CLI-only). It binds 127.0.0.1 unless WEB_UI_HOST overrides it.
const webEnabled = process.env.WEB_UI !== '0' && process.env.WEB_UI !== 'false';
if (webEnabled) {
  const port = Number(process.env.WEB_UI_PORT) || 3000;
  const host = process.env.WEB_UI_HOST || '127.0.0.1';
  startWebServer({ db, bot, port, host });
  console.log(`[web] dashboard on http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
}

if (hasDiscordCreds()) {
  const r = await bot.start();
  if (!r.ok) console.error('[bot] failed to start:', r.error);
} else if (webEnabled) {
  console.log('[bot] no Discord credentials yet — open the dashboard to connect your bot.');
} else {
  // Headless with no creds is a misconfiguration; fail loudly like before.
  console.error('[bot] Missing DISCORD_TOKEN / DISCORD_CLIENT_ID and the web UI is disabled. Nothing to do.');
  process.exit(1);
}
