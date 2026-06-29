import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

const WHISPER = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'];
const LANGS = [['auto', 'Auto-detect'], ['en', 'English'], ['de', 'German'], ['es', 'Spanish'], ['fr', 'French'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['ja', 'Japanese'], ['zh', 'Chinese']];
const SUMMARY_LANGS = [['match', 'Match transcription'], ...LANGS.filter(([c]) => c !== 'auto')];

// Sensible first-run defaults per provider so switching provider never leaves a
// stale model from the previous provider stored (mirrors the DEFAULTS in src/store/config.js
// for gemini; opencode fallback from src/adapters/summarizer/index.js).
const PROVIDER_DEFAULTS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  ollama: 'llama3',
  opencode: 'deepseek-v4-flash',
};

const field = 'bg-panel border border-edge rounded-md px-2 py-1 text-sm w-full';

export default function Setup() {
  const { guildId } = useGuild();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [modelDraft, setModelDraft] = useState('');

  useEffect(() => { if (guildId) api.config(guildId).then(setData); }, [guildId]);

  // Keep the controlled model input in sync whenever the server config changes
  // (initial load, provider switch, or an explicit model save).
  useEffect(() => {
    if (data?.config) setModelDraft(data.config.summarizerModel);
  }, [data?.config?.summarizerModel]);

  if (!guildId) return <div className="text-muted">No guilds yet.</div>;
  if (!data) return <div className="text-muted">Loading…</div>;

  const { config: c, providers, channels } = data;
  const save = async (patch) => {
    try { const r = await api.saveConfig(guildId, patch); setData((d) => ({ ...d, config: r.config })); setMsg('Saved.'); }
    catch (e) { setMsg(e.message); }
  };

  return (
    <div className="max-w-md space-y-4">
      <div>
        <label className="block text-sm text-muted mb-1">Summarizer provider</label>
        <select className={field} value={c.summarizerProvider}
          onChange={(e) => {
            const p = e.target.value;
            // Always send a model valid for the new provider so the stored model
            // is never silently left as a value from the previous provider.
            save({ provider: p, model: PROVIDER_DEFAULTS[p] || '' });
          }}>
          {providers.map((p) => <option key={p.provider} value={p.provider} disabled={!p.ok}>
            {p.provider}{p.ok ? '' : ` (set ${p.missing} in .env)`}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm text-muted mb-1">Model</label>
        <input className={field} value={modelDraft}
          onChange={(e) => setModelDraft(e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== c.summarizerModel) {
              save({ provider: c.summarizerProvider, model: v });
            } else if (!v) {
              // Don't save an empty model — reset the draft to what the server has.
              setModelDraft(c.summarizerModel);
            }
          }} />
      </div>
      <div>
        <label className="block text-sm text-muted mb-1">Whisper model</label>
        <select className={field} value={c.whisperModel} onChange={(e) => save({ whisperModel: e.target.value })}>
          {WHISPER.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm text-muted mb-1">Notes channel</label>
        <select className={field} value={c.notesChannelId || ''} onChange={(e) => save({ notesChannelId: e.target.value || null })}>
          <option value="">(none)</option>
          {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm text-muted mb-1">Spoken language</label>
        <select className={field} value={c.language} onChange={(e) => save({ language: e.target.value })}>
          {LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm text-muted mb-1">Summary language</label>
        <select className={field} value={c.summaryLanguage} onChange={(e) => save({ summary_language: e.target.value })}>
          {SUMMARY_LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={c.autoJoin} onChange={(e) => save({ autoJoin: e.target.checked })} /> Auto-join voice
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={c.useThread} onChange={(e) => save({ useThread: e.target.checked })} /> Post notes in a thread
      </label>
      {msg && <div className="text-sm text-accent">{msg}</div>}
    </div>
  );
}
