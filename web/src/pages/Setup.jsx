import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon, Empty } from '../components/ui.jsx';

const WHISPER = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo'];
const LANGS = [['auto', 'Auto-detect'], ['en', 'English'], ['de', 'German'], ['es', 'Spanish'], ['fr', 'French'],
  ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['ja', 'Japanese'], ['zh', 'Chinese']];
const SUMMARY_LANGS = [['match', 'Match transcription'], ...LANGS.filter(([c]) => c !== 'auto')];

const PROVIDER_DEFAULTS = {
  gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', ollama: 'llama3', opencode: 'deepseek-v4-flash',
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

export default function Setup() {
  const { guildId } = useGuild();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);
  const [modelDraft, setModelDraft] = useState('');

  useEffect(() => { if (guildId) api.config(guildId).then(setData).catch(() => setData(null)); }, [guildId]);
  useEffect(() => { if (data?.config) setModelDraft(data.config.summarizerModel); }, [data?.config?.summarizerModel]);

  if (!guildId) return <Page><Empty icon={Icon.Settings} title="No server selected" /></Page>;
  if (!data) return (
    <Page max="720px">
      <div className="h-8 w-32 skeleton mb-7" />
      <div className="space-y-5">{[0,1,2].map(i => <div key={i} className="h-44 skeleton rounded-[14px]" />)}</div>
    </Page>
  );

  const { config: c, providers, channels } = data;
  const save = async (patch) => {
    try {
      const r = await api.saveConfig(guildId, patch);
      setData((d) => ({ ...d, config: r.config }));
      setMsg('Saved'); setMsgErr(false);
    } catch (e) { setMsg(e.message); setMsgErr(true); }
    setTimeout(() => setMsg(''), 2400);
  };
  const sel = 'input appearance-none pr-9 cursor-pointer';

  return (
    <Page max="720px">
      <PageHead
        title="Settings"
        subtitle="Per-server configuration. Applied instantly, no restart."
        actions={msg && <span className={`text-sm font-medium ${msgErr ? 'text-error' : 'text-accent'}`}>{msg}</span>}
      />

      <div className="space-y-5">
        <Card title="Summarizer" desc="Which AI turns transcripts into structured notes.">
          <Field label="Provider">
            <div className="relative">
              <select className={sel} value={c.summarizerProvider}
                onChange={(e) => { const p = e.target.value; save({ provider: p, model: PROVIDER_DEFAULTS[p] || '' }); }}>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider} disabled={!p.ok}>
                    {p.provider}{p.ok ? '' : ` (set ${p.missing} in .env)`}
                  </option>
                ))}
              </select>
              <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
            </div>
          </Field>
          <Field label="Model" hint="The model id for the chosen provider.">
            <input className="input" value={modelDraft} onChange={(e) => setModelDraft(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.summarizerModel) save({ provider: c.summarizerProvider, model: v });
                else if (!v) setModelDraft(c.summarizerModel);
              }} />
          </Field>
        </Card>

        <Card title="Transcription" desc="Local faster-whisper speech-to-text.">
          <Field label="Whisper model" hint="Larger is more accurate but slower.">
            <div className="relative">
              <select className={sel} value={c.whisperModel} onChange={(e) => save({ whisperModel: e.target.value })}>
                {WHISPER.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
            </div>
          </Field>
          <Field label="Spoken language">
            <div className="relative">
              <select className={sel} value={c.language} onChange={(e) => save({ language: e.target.value })}>
                {LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
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
              <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
            </div>
          </Field>
          <Field label="Summary language">
            <div className="relative">
              <select className={sel} value={c.summaryLanguage} onChange={(e) => save({ summary_language: e.target.value })}>
                {SUMMARY_LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
              <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
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
