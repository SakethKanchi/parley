import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from './ui.jsx';

/* Shared building blocks for editing the Discord/STT connection. Used by the
   first-run Onboarding screen and the Connection card in Settings. The Discord
   token is write-only (we only ever learn whether one is set). */

function Labeled({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

/** Secret input: shows a "set / not set" badge until the user chooses to edit. */
function SecretField({ label, hint, present, value, onChange, placeholder }) {
  const [editing, setEditing] = useState(!present);
  const [reveal, setReveal] = useState(false);
  if (!editing) {
    return (
      <Labeled label={label} hint={hint}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1.5 rounded-sm text-accent bg-accent-soft">
            <span style={{ width: 6, height: 6, borderRadius: 6, background: 'currentColor' }} />
            Set
          </span>
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost !py-1.5">Replace</button>
        </div>
      </Labeled>
    );
  }
  return (
    <Labeled label={label} hint={hint}>
      <div className="relative">
        <input
          type={reveal ? 'text' : 'password'} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className="input !pr-12" autoComplete="off" spellCheck={false} />
        <button type="button" onClick={() => setReveal((r) => !r)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs">{reveal ? 'Hide' : 'Show'}</button>
      </div>
      {present && (
        <button type="button" onClick={() => { onChange(''); setEditing(false); }} className="text-xs text-muted hover:text-ink mt-1.5">Keep existing key</button>
      )}
    </Labeled>
  );
}

/**
 * Editable Discord token + client id + STT url. `conn` is the system status
 * `connection` object. Calls onSaved(result) after a successful save.
 * `compact` drops the in-card heading (Settings supplies its own).
 */
export function ConnectionForm({ conn, onSaved, submitLabel = 'Save & connect' }) {
  const [token, setToken] = useState('');
  const [clientId, setClientId] = useState(conn?.discordClientId?.value || '');
  const [sttUrl, setSttUrl] = useState(conn?.sttUrl?.value || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const tokenPresent = !!conn?.discordToken?.set;

  async function submit(e) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    const patch = {};
    if (token.trim()) patch.discordToken = token.trim();
    if (clientId.trim() !== (conn?.discordClientId?.value || '')) patch.discordClientId = clientId.trim();
    if (sttUrl.trim() !== (conn?.sttUrl?.value || '')) patch.sttUrl = sttUrl.trim();
    if (Object.keys(patch).length === 0) { setErr('Nothing changed.'); setBusy(false); return; }
    try {
      const r = await api.setConnection(patch);
      setToken('');
      onSaved?.(r);
    } catch (e2) {
      setErr(e2?.message || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <SecretField
        label="Discord bot token"
        present={tokenPresent}
        value={token}
        onChange={setToken}
        placeholder="Paste your bot token…"
        hint={<>From the <a className="text-primary hover:underline" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Developer Portal</a> → your app → Bot → Reset Token. Stored in <code className="text-ink-2">.env</code>, never shown again.</>}
      />
      <Labeled label="Application (client) ID" hint="Developer Portal → your app → General Information → Application ID.">
        <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}
          placeholder="e.g. 1362914118918602893" inputMode="numeric" autoComplete="off" />
      </Labeled>
      <Labeled label="STT sidecar URL" hint="Where the local faster-whisper sidecar listens. In Docker this is set for you.">
        <input className="input" value={sttUrl} onChange={(e) => setSttUrl(e.target.value)}
          placeholder="http://127.0.0.1:8000" autoComplete="off" />
      </Labeled>
      {err && <p className="text-sm text-error">{err}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary !py-2.5 w-full justify-center">
        {busy ? 'Connecting…' : submitLabel}
      </button>
    </form>
  );
}

/** A compact live badge for the bot connection state. */
export function BotStatusBadge({ bot }) {
  const map = {
    ready: { label: 'Connected', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    starting: { label: 'Connecting…', color: 'var(--warn)', bg: 'var(--warn-soft)' },
    error: { label: 'Error', color: 'var(--error)', bg: 'var(--error-soft)' },
    stopped: { label: 'Not connected', color: 'var(--muted)', bg: 'var(--surface-3)' },
  };
  const s = map[bot?.state] || map.stopped;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ color: s.color, background: s.bg }}>
      <span style={{ width: 6, height: 6, borderRadius: 6, background: s.color }} />
      {s.label}{bot?.user?.tag ? ` · ${bot.user.tag}` : ''}
    </span>
  );
}

export { Icon };
