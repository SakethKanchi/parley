// src/sidecar-controller.js
// Owns the local faster-whisper STT sidecar process so the web UI can start and
// stop it on demand. Mirrors BotController.
//
// Design notes:
//   • "Managed" only when the sidecar URL is local AND the Python venv exists.
//     In Docker the sidecar is a separate container (no venv in the bot image,
//     URL points at the `stt` service), so this controller reports managed:false
//     and never tries to spawn — the container orchestrator owns it there.
//   • start() health-checks first. If something is already listening (e.g. you
//     ran `npm run sidecar` yourself, or a leftover process), we adopt it as
//     "external" instead of spawning a duplicate and colliding on the port.
//   • stop() only kills a process WE spawned; it can't kill an external one.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function isLocalHost(host) {
  return ['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]'].includes(host);
}

export class SidecarController {
  constructor({ sttUrl, deps = {} } = {}) {
    this.sttUrl = sttUrl || 'http://127.0.0.1:8000';
    this.spawnImpl = deps.spawn || spawn;
    this.fetchImpl = deps.fetch || fetch;
    this.exists = deps.exists || existsSync;
    this.pythonPath = deps.pythonPath || join(ROOT, 'stt_sidecar', '.venv', 'bin', 'python');
    this.serverPath = deps.serverPath || join(ROOT, 'stt_sidecar', 'server.py');

    this.child = null;       // process we spawned (null if external/none)
    this.external = false;   // true once we adopt an already-running sidecar
    this.state = 'stopped';  // 'stopped' | 'starting' | 'running' | 'error'
    this.error = null;
    this.logTail = [];       // last few stdout/stderr lines for the UI
  }

  // Local + venv present => we can manage the process here.
  managed() {
    let host;
    try { host = new URL(this.sttUrl).hostname; } catch { return false; }
    return isLocalHost(host) && this.exists(this.pythonPath) && this.exists(this.serverPath);
  }

  _bind() {
    const u = new URL(this.sttUrl);
    return { host: u.hostname === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1', port: u.port || '8000' };
  }

  async healthy(timeoutMs = 1500) {
    try {
      const res = await this.fetchImpl(`${this.sttUrl.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      return res.ok;
    } catch { return false; }
  }

  _pushLog(line) {
    for (const l of String(line).split(/\r?\n/)) {
      const t = l.trim();
      if (t) { this.logTail.push(t); if (this.logTail.length > 20) this.logTail.shift(); }
    }
  }

  // Start the sidecar if it isn't already up. Idempotent. Resolves once the
  // /health endpoint responds (or the spawn fails / times out).
  async start({ waitMs = 60_000 } = {}) {
    if (this.state === 'running' || this.state === 'starting') return { ok: true, state: this.state };
    // Already serving (started by us earlier, by the user, or another process)?
    if (await this.healthy()) {
      if (!this.child) this.external = true;
      this.state = 'running'; this.error = null;
      return { ok: true, state: this.state, external: this.external };
    }
    if (!this.managed()) {
      this.state = 'error';
      this.error = this.exists(this.pythonPath)
        ? `STT_URL (${this.sttUrl}) is not local; this sidecar is managed elsewhere.`
        : 'Local sidecar is not installed (no Python venv). See README "Set up the Python STT sidecar".';
      return { ok: false, error: this.error };
    }
    this.state = 'starting'; this.error = null;
    const { host, port } = this._bind();
    try {
      const child = this.spawnImpl(this.pythonPath, [this.serverPath], {
        env: { ...process.env, STT_HOST: host, STT_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      this.external = false;
      child.stdout?.on('data', (d) => this._pushLog(d.toString()));
      child.stderr?.on('data', (d) => this._pushLog(d.toString()));
      child.on('exit', (code) => {
        // Only reflect an unexpected exit; a deliberate stop() nulls this.child first.
        if (this.child === child) {
          this.child = null;
          if (this.state !== 'stopped') { this.state = 'error'; this.error = `Sidecar exited (code ${code}).`; }
        }
      });
      child.on('error', (e) => { this.error = e.message; this.state = 'error'; });
    } catch (e) {
      this.state = 'error'; this.error = e.message;
      return { ok: false, error: e.message };
    }
    // Poll /health until it comes up (model import + boot can take a few seconds).
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      if (this.state === 'error') return { ok: false, error: this.error };
      if (await this.healthy()) { this.state = 'running'; return { ok: true, state: 'running' }; }
      await new Promise((r) => setTimeout(r, 500));
    }
    this.state = 'error'; this.error = 'Sidecar did not become healthy in time.';
    return { ok: false, error: this.error };
  }

  // Stop a sidecar WE spawned. An adopted external process is left alone.
  async stop() {
    const child = this.child;
    this.state = 'stopped'; this.error = null;
    if (child) {
      this.child = null;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      return { ok: true, state: 'stopped' };
    }
    if (this.external) {
      this.external = false;
      return { ok: true, state: 'stopped', note: 'External sidecar left running (not managed by this process).' };
    }
    return { ok: true, state: 'stopped' };
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  status() {
    return {
      state: this.state,
      error: this.error,
      running: this.state === 'running',
      managed: this.managed(),
      external: this.external,
      url: this.sttUrl,
      log: this.logTail.slice(-5),
    };
  }
}
