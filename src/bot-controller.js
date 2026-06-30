// src/bot-controller.js
// Owns the Discord bot lifecycle so the web UI can start/restart it on demand.
// The web server boots first and always; the bot starts only when credentials
// exist (either from the environment at boot, or saved later via the UI).
import { startBot } from './bot.js';
import { hasDiscordCreds } from './config/env.js';

export class BotController {
  constructor({ db, audioRoot }) {
    this.db = db;
    this.audioRoot = audioRoot;
    this.client = null;
    this.manager = null;
    this.stopAndLeave = null;
    this.state = 'stopped';     // 'stopped' | 'starting' | 'ready' | 'error'
    this.error = null;
  }

  isRunning() {
    return this.state === 'starting' || this.state === 'ready';
  }

  /** Start the bot if creds exist and it isn't already running. Idempotent. */
  async start() {
    if (this.isRunning()) return { ok: true, state: this.state };
    if (!hasDiscordCreds()) {
      this.state = 'stopped';
      this.error = 'Discord credentials are not set.';
      return { ok: false, error: this.error };
    }
    this.state = 'starting';
    this.error = null;
    try {
      const { client, manager, stopAndLeave } = startBot({ db: this.db, audioRoot: this.audioRoot });
      this.client = client;
      this.manager = manager;
      this.stopAndLeave = stopAndLeave;
      client.once('ready', () => { this.state = 'ready'; });
      client.on('error', (e) => { this.error = e.message; });
      // discord.js emits 'invalidated' / login rejects on a bad token.
      client.once('invalidated', () => { this.state = 'error'; this.error = 'Discord session invalidated (bad token?).'; });
      return { ok: true, state: this.state };
    } catch (e) {
      this.state = 'error';
      this.error = e.message;
      return { ok: false, error: e.message };
    }
  }

  /** Tear down the live client (best-effort). */
  async stop() {
    if (this.client) {
      try { await this.client.destroy(); } catch { /* ignore */ }
    }
    this.client = null;
    this.manager = null;
    this.stopAndLeave = null;
    this.state = 'stopped';
  }

  /** In-progress recordings (for the web dashboard's live view). */
  liveMeetings() {
    return this.manager ? this.manager.listActive() : [];
  }

  /** Stop a live recording in a channel from the dashboard. Best-effort. */
  async stopMeeting(guildId, channelId) {
    if (!this.manager) throw new Error('Bot is not running.');
    if (!this.manager.isActive(guildId, channelId)) return { ok: false, error: 'No active recording in that channel.' };
    // stopAndLeave both finalizes the meeting and disconnects the voice client.
    if (this.stopAndLeave) await this.stopAndLeave(guildId, channelId);
    else await this.manager.stop(guildId, channelId);
    return { ok: true };
  }

  /** Stop then start — used after credentials change in the UI. */
  async restart() {
    await this.stop();
    return this.start();
  }

  /** Snapshot for the web UI. */
  status() {
    return {
      state: this.state,
      error: this.error,
      connected: this.state === 'ready',
      hasCreds: hasDiscordCreds(),
      user: this.client?.user ? { tag: this.client.user.tag, id: this.client.user.id } : null,
      guildCount: this.client?.guilds?.cache?.size ?? 0,
    };
  }
}
