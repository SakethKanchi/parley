import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Page, PageHead } from '../components/Page.jsx';
import { Icon, Empty } from '../components/ui.jsx';

const CATEGORY_ORDER = ['Recording', 'Notes', 'Configuration'];
const CATEGORY_META = {
  Recording: { desc: 'Start and stop capturing a voice meeting.' },
  Notes: { desc: 'Read, post, and search your meeting notes.' },
  Configuration: { desc: 'Set the bot up for your server.' },
};

function CommandRow({ cmd }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <code className="shrink-0 mt-0.5 inline-flex items-center font-mono text-[13px] font-medium text-primary bg-primary-soft rounded-sm px-2 py-1">
        /{cmd.name}
      </code>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-medium text-ink">{cmd.summary}</p>
          {cmd.admin && (
            <span className="chip !text-warn !bg-warn-soft">Admin</span>
          )}
        </div>
        {cmd.args && <p className="text-xs text-muted mt-1 font-mono">/{cmd.name} <span className="text-faint">{cmd.args}</span></p>}
        {cmd.detail && <p className="text-[13px] text-muted leading-relaxed mt-1.5">{cmd.detail}</p>}
      </div>
    </div>
  );
}

export default function Commands() {
  const [commands, setCommands] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stale = false;
    api.commands()
      .then((r) => { if (!stale) setCommands(r.commands || []); })
      .catch((e) => { if (!stale) setError(e?.message || 'Failed to load commands'); });
    return () => { stale = true; };
  }, []);

  const byCat = (cat) => (commands || []).filter((c) => c.category === cat);

  return (
    <Page max="820px">
      <PageHead
        title="Commands"
        subtitle="Slash commands your members can run in Discord. Type / in any channel to see them."
      />

      {error ? (
        <Empty icon={Icon.Terminal} title="Couldn't load commands" body={error} />
      ) : !commands ? (
        <div className="space-y-5">{[0, 1, 2].map((i) => <div key={i} className="h-40 skeleton rounded-[14px]" />)}</div>
      ) : (
        <div className="space-y-5">
          {CATEGORY_ORDER.filter((cat) => byCat(cat).length > 0).map((cat) => (
            <section key={cat} className="card overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-bold text-ink">{cat}</h2>
                {CATEGORY_META[cat]?.desc && <p className="text-xs text-muted mt-0.5">{CATEGORY_META[cat].desc}</p>}
              </div>
              <div className="divide-y divide-border">
                {byCat(cat).map((cmd) => <CommandRow key={cmd.name} cmd={cmd} />)}
              </div>
            </section>
          ))}

          <div className="card p-5 flex items-start gap-3">
            <Icon.Sparkle width={18} height={18} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-ink">Tip: auto-record</p>
              <p className="text-[13px] text-muted leading-relaxed mt-1">
                With auto-join on, the bot records automatically when two or more people are in a voice channel,
                so nobody has to run <code className="text-ink-2">/join</code>. Toggle it in{' '}
                <Link to="/setup" className="text-primary hover:underline">Settings</Link> or with{' '}
                <code className="text-ink-2">/setup autojoin</code>.
              </p>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
