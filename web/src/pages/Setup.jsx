import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { useSystem } from '../SystemContext.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon, Empty } from '../components/ui.jsx';
import { ConnectionForm, BotStatusBadge } from '../components/Connection.jsx';

const WHISPER = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'];
const LANGS = [['auto', 'Auto-detect'], ['en', 'English'], ['de', 'German'], ['es', 'Spanish'], ['fr', 'French'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['ja', 'Japanese'], ['zh', 'Chinese']];
const SUMMARY_LANGS = [['match', 'Match transcription'], ...LANGS.filter(([c]) => c !== 'auto')];

const PROVIDER_DEFAULTS = {
  gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', ollama: 'llama3', opencode: 'deepseek-v4-flash',
};
// Providers whose key is editable from the UI (Ollama is keyless/local).
const KEYED = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', opencode: 'OPENCODE_API_KEY' };
const KEY_HELP = {
  gemini: 'aistudio.google.com/apikey',
  openai: 'platform.openai.com/api-keys',
  opencode: 'opencode.ai/zen',
};

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-ink mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

function Card({ title, desc, children }) {
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label, desc }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer select-none">
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {desc && <span className="block text-xs text-muted mt-0.5">{desc}</span>}
      </span>
      <span className="relative shrink-0 mt-0.5">
        <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className="block h-6 w-10 rounded-full bg-surface-3 peer-checked:bg-primary transition-colors" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function Chevron() {
  return <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />;
}

/* ── API key editor ───────────────────────────────────────────────────────
   Shows a "set / not set" badge; lets the user paste a new key (saved to .env,
   applied live) or clear it. The value is never read back from the server. */
function KeyEditor({ provider, present, onChanged }) {
  const envVar = KEYED[provider];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setBusy(true); setErr(null);
    try { await api.setProviderKey(provider, value.trim()); setValue(''); setEditing(false); onChanged?.(); }
    catch (e) { setErr(e?.message || 'Failed to save key'); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!window.confirm(`Remove the ${provider} API key from .env?`)) return;
    setBusy(true); setErr(null);
    try { await api.setProviderKey(provider, ''); setValue(''); setEditing(false); onChanged?.(); }
    catch (e) { setErr(e?.message || 'Failed to clear key'); }
    finally { setBusy(false); }
  }

  return (
    <Field label="API key" hint={err ? undefined : <>Stored in <code className="text-ink-2">.env</code> as <code className="text-ink-2">{envVar}</code> · get one at {KEY_HELP[provider]}</>}>
      {!editing ? (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1.5 rounded-sm ${present ? 'text-accent bg-accent-soft' : 'text-warn bg-warn-soft'}`}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: 'currentColor' }} />
            {present ? 'Key set' : 'No key'}
          </span>
          <button onClick={() => setEditing(true)} className="btn btn-ghost !py-1.5">{present ? 'Replace' : 'Add key'}</button>
          {present && <button onClick={clear} disabled={busy} className="btn btn-ghost !py-1.5 !text-error">Remove</button>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={reveal ? 'text' : 'password'} value={value} autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(''); } }}
              placeholder={`Paste ${provider} API key…`} className="input !pr-10" />
            <button type="button" onClick={() => setReveal((r) => !r)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs">{reveal ? 'Hide' : 'Show'}</button>
          </div>
          <button onClick={save} disabled={!value.trim() || busy} className="btn btn-primary !py-2">{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setEditing(false); setValue(''); }} disabled={busy} className="btn btn-ghost !py-2">Cancel</button>
        </div>
      )}
      {err && <p className="text-xs text-error mt-1.5">{err}</p>}
    </Field>
  );
}

/* ── Connection card (server-wide Discord + STT settings) ────────────────── */
function ConnectionCard({ sys, onChanged }) {
  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const bot = sys?.bot;
  const conn = sys?.connection;
  if (!sys?.managed) {
    return (
      <Card title="Connection" desc="Discord bot connection.">
        <p className="text-sm text-muted">
          This dashboard is running in read-only mode (no bot process attached), so the Discord
          connection is managed elsewhere. Start Parley with <code className="text-ink-2">npm start</code> to
          edit it here.
        </p>
        {bot && <div className="mt-2"><BotStatusBadge bot={bot} /></div>}
      </Card>
    );
  }
  async function restart() {
    setRestarting(true);
    try { await api.botAction('restart'); await onChanged?.(); }
    finally { setRestarting(false); }
  }
  return (
    <Card title="Connection" desc="Your Discord bot. Changes reconnect instantly.">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {bot && <BotStatusBadge bot={bot} />}
          {bot?.guildCount > 0 && <span className="text-xs text-muted">{bot.guildCount} server{bot.guildCount === 1 ? '' : 's'}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={restart} disabled={restarting} className="btn btn-ghost !py-1.5">{restarting ? 'Reconnecting…' : 'Reconnect'}</button>
          <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost !py-1.5">{open ? 'Close' : 'Edit credentials'}</button>
        </div>
      </div>
      {bot?.state === 'error' && bot?.error && <p className="text-xs text-error mt-2">{bot.error}</p>}
      {open && (
        <div className="mt-4 pt-4 border-t border-border">
          <ConnectionForm conn={conn} submitLabel="Save & reconnect" onSaved={async () => { setOpen(false); await onChanged?.(); }} />
        </div>
      )}
    </Card>
  );
}

export default function Setup() {
  const { guildId } = useGuild();
  const { status: sys, refresh: refreshSys } = useSystem();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);
  const [modelDraft, setModelDraft] = useState('');
  const [models, setModels] = useState([]); // suggestions for current provider
  const listId = useRef(`models-${Math.random().toString(36).slice(2)}`).current;

  function reload() { if (guildId) api.config(guildId).then(setData).catch(() => setData(null)); }
  useEffect(() => { reload(); }, [guildId]);
  useEffect(() => { if (data?.config) setModelDraft(data.config.summarizerModel); }, [data?.config?.summarizerModel]);

  // Fetch the live model list whenever the provider changes (incl. Ollama tags).
  const provider = data?.config?.summarizerProvider;
  useEffect(() => {
    if (!provider) return;
    let stale = false;
    api.providerModels(provider).then((r) => { if (!stale) setModels(r.models || []); }).catch(() => { if (!stale) setModels([]); });
    return () => { stale = true; };
  }, [provider]);

  if (!guildId) return (
    <Page max="720px">
      <PageHead title="Settings" subtitle="Discord connection and per-server configuration." />
      <ConnectionCard sys={sys} onChanged={refreshSys} />
      <div className="mt-5"><Empty icon={Icon.Settings} title="No server selected" body="Pick a server from the top bar to configure summarizer, transcription, and delivery." /></div>
    </Page>
  );
  if (!data) return (
    <Page max="720px">
      <div className="h-8 w-32 skeleton mb-7" />
      <div className="space-y-5">{[0,1,2].map(i => <div key={i} className="h-44 skeleton rounded-[14px]" />)}</div>
    </Page>
  );

  const { config: c, providers, channels, secrets = {} } = data;
  const save = async (patch) => {
    try {
      const r = await api.saveConfig(guildId, patch);
      setData((d) => ({ ...d, config: r.config }));
      setMsg('Saved'); setMsgErr(false);
    } catch (e) { setMsg(e.message); setMsgErr(true); }
    setTimeout(() => setMsg(''), 2400);
  };
  const sel = 'input appearance-none pr-9 cursor-pointer';
  const keyed = Object.prototype.hasOwnProperty.call(KEYED, c.summarizerProvider);

  return (
    <Page max="720px">
      <PageHead
        title="Settings"
        subtitle="Per-server configuration. Applied instantly, no restart."
        actions={msg && <span className={`text-sm font-medium ${msgErr ? 'text-error' : 'text-accent'}`}>{msg}</span>}
      />

      <div className="space-y-5">
        <ConnectionCard sys={sys} onChanged={refreshSys} />
        <Card title="Summarizer" desc="Which AI turns transcripts into structured notes.">
          <Field label="Provider">
            <div className="relative">
              <select className={sel} value={c.summarizerProvider}
                onChange={(e) => { const p = e.target.value; save({ provider: p, model: PROVIDER_DEFAULTS[p] || '' }); }}>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.provider}{p.ok ? '' : ' (no key set)'}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          </Field>

          {keyed && <KeyEditor provider={c.summarizerProvider} present={!!secrets[c.summarizerProvider]} onChanged={reload} />}

          <Field label="Model" hint={models.length ? 'Pick a suggestion or type any model id the provider supports.' : 'Type the model id for the chosen provider.'}>
            <input className="input" value={modelDraft} list={listId}
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.summarizerModel) save({ provider: c.summarizerProvider, model: v });
                else if (!v) setModelDraft(c.summarizerModel);
              }} />
            <datalist id={listId}>
              {models.map((m) => <option key={m} value={m} />)}
            </datalist>
            {models.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {models.slice(0, 6).map((m) => (
                  <button key={m} type="button"
                    onClick={() => { setModelDraft(m); if (m !== c.summarizerModel) save({ provider: c.summarizerProvider, model: m }); }}
                    className={`chip hover:!bg-surface-2 transition-colors ${m === c.summarizerModel ? '!bg-primary-soft !text-ink' : ''}`}>{m}</button>
                ))}
              </div>
            )}
          </Field>
        </Card>

        <Card title="Transcription" desc="Local faster-whisper speech-to-text.">
          <Field label="Whisper model" hint="Larger is more accurate but slower.">
            <div className="relative">
              <select className={sel} value={c.whisperModel} onChange={(e) => save({ whisperModel: e.target.value })}>
                {WHISPER.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
          <Field label="Spoken language">
            <div className="relative">
              <select className={sel} value={c.language} onChange={(e) => save({ language: e.target.value })}>
                {LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
        </Card>

        <Card title="Delivery" desc="Where and how notes are posted in Discord.">
          <Field label="Notes channel">
            <div className="relative">
              <select className={sel} value={c.notesChannelId || ''} onChange={(e) => save({ notesChannelId: e.target.value || null })}>
                <option value="">(meeting's own channel)</option>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
          <Field label="Summary language">
            <div className="relative">
              <select className={sel} value={c.summaryLanguage} onChange={(e) => save({ summary_language: e.target.value })}>
                {SUMMARY_LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>
          <Switch checked={c.useThread} onChange={(e) => save({ useThread: e.target.checked })}
            label="Post notes in a thread" desc="Keeps the channel tidy by threading each meeting's notes." />
        </Card>

        <Card title="Behavior">
          <Switch checked={c.autoJoin} onChange={(e) => save({ autoJoin: e.target.checked })}
            label="Auto-join voice" desc="Join automatically when two or more people are in a voice channel." />
        </Card>
      </div>
    </Page>
  );
}
