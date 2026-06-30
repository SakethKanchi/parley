import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { Page, PageHead } from '../components/Page.jsx';
import { MeetingCard, MeetingRow } from '../components/MeetingCard.jsx';
import { Icon, Empty } from '../components/ui.jsx';
import { bucketOf, BUCKET_ORDER } from '../lib/format.js';

function Toggle({ options, value, onChange }) {
  return (
    <div className="inline-flex bg-surface-2 border border-border rounded-sm p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-2.5 py-1.5 rounded-[6px] text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${value === o.value ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'}`}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function GridSkeleton({ view }) {
  return view === 'grid' ? (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-56 skeleton rounded-[14px]" />)}
    </div>
  ) : (
    <div className="card divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 skeleton m-2 rounded-md" />)}
    </div>
  );
}

export default function Meetings() {
  const { guildId } = useGuild();
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('grid');
  const [channel, setChannel] = useState('__all__');

  useEffect(() => {
    if (!guildId) return;
    let stale = false;
    setMeetings(null); setError(null); setChannel('__all__');
    api.meetings(guildId)
      .then((rows) => { if (!stale) setMeetings((Array.isArray(rows) ? rows : []).filter((m) => (m.utterance_count ?? 1) > 0 || m.failed)); })
      .catch((e) => { if (!stale) setError(e?.message || 'Failed to load'); });
    return () => { stale = true; };
  }, [guildId]);

  const channels = useMemo(() => {
    if (!meetings) return [];
    return [...new Set(meetings.map((m) => m.channel_name))].sort();
  }, [meetings]);

  const filtered = useMemo(() => {
    if (!meetings) return [];
    return channel === '__all__' ? meetings : meetings.filter((m) => m.channel_name === channel);
  }, [meetings, channel]);

  // Group into time buckets for the list view.
  const grouped = useMemo(() => {
    const by = new Map();
    for (const m of filtered) {
      const b = bucketOf(m.started_at);
      if (!by.has(b)) by.set(b, []);
      by.get(b).push(m);
    }
    return BUCKET_ORDER.filter((b) => by.has(b)).map((b) => [b, by.get(b)]);
  }, [filtered]);

  if (!guildId) return <Page><Empty icon={Icon.Meetings} title="No server selected" /></Page>;

  return (
    <Page>
      <PageHead
        title="Meetings"
        subtitle={meetings ? `${filtered.length} meeting${filtered.length === 1 ? '' : 's'}` : 'Loading…'}
        actions={
          <Toggle
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid', icon: <Icon.Meetings width={14} height={14} /> },
              { value: 'list', label: 'List', icon: <Icon.Doc width={14} height={14} /> },
            ]}
          />
        }
      />

      {channels.length > 1 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button onClick={() => setChannel('__all__')}
            className={`chip ${channel === '__all__' ? '!bg-primary-soft !text-ink' : ''}`}>All channels</button>
          {channels.map((c) => (
            <button key={c} onClick={() => setChannel(c)}
              className={`chip ${channel === c ? '!bg-primary-soft !text-ink' : ''}`}>
              <Icon.Hash width={11} height={11} />{c}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <Empty icon={Icon.Meetings} title="Couldn't load meetings" body={error} />
      ) : !meetings ? (
        <GridSkeleton view={view} />
      ) : filtered.length === 0 ? (
        <div className="card"><Empty icon={Icon.Meetings} title="No meetings yet" body="Recorded meetings will show up here." /></div>
      ) : view === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => <MeetingCard key={m.id} m={m} />)}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([bucket, rows]) => (
            <div key={bucket}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-1.5 px-4">{bucket}</h2>
              <div className="card p-1">
                {rows.map((m) => <MeetingRow key={m.id} m={m} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
