import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { Page, PageHead, SectionHead } from '../components/Page.jsx';
import { BarChart, RankBars, Donut } from '../components/charts.jsx';
import { Avatar, Icon, Empty } from '../components/ui.jsx';
import { fmtHours, fmtMs, fmtCompact, colorOf, fmtDateShort } from '../lib/format.js';

function StatTile({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="stat-value text-ink text-2xl">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
      {sub && <div className="text-[11px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const { guildId } = useGuild();
  const [agg, setAgg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!guildId) return;
    let stale = false;
    setAgg(null); setError(null);
    api.stats(guildId)
      .then((a) => { if (!stale) setAgg(a); })
      .catch((e) => { if (!stale) setError(e?.message || 'Failed to load'); });
    return () => { stale = true; };
  }, [guildId]);

  const wordRows = useMemo(() => {
    if (!agg) return [];
    return agg.leaderboard.slice(0, 8).map((p) => ({
      label: p.displayName, value: p.words, display: `${fmtCompact(p.words)} words`, color: colorOf(p.displayName),
    }));
  }, [agg]);

  if (!guildId) return <Page><Empty icon={Icon.Chart} title="No server selected" /></Page>;
  if (error) return <Page><Empty icon={Icon.Chart} title="Couldn't load analytics" body={error} /></Page>;
  if (!agg) return (
    <Page>
      <div className="h-8 w-44 skeleton mb-7" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">{[0,1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-[14px]" />)}</div>
      <div className="grid lg:grid-cols-2 gap-6">{[0,1].map(i => <div key={i} className="h-72 skeleton rounded-[14px]" />)}</div>
    </Page>
  );

  const { stats, leaderboard, timeline } = agg;
  const totalDays = timeline.filter((t) => t.count > 0).length;
  const avgPerActiveDay = totalDays ? (stats.totalMeetings / totalDays) : 0;
  const talkRows = leaderboard.slice(0, 8).map((p) => ({
    label: p.displayName, value: p.ms, display: fmtMs(p.ms), color: colorOf(p.displayName),
  }));

  return (
    <Page>
      <PageHead title="Analytics" subtitle="Talk-time, participation and meeting cadence across this server." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Total meetings" value={stats.totalMeetings} sub={`over ${totalDays} active days`} />
        <StatTile label="Total talk time" value={fmtHours(stats.totalTalkMs)} sub={`${fmtCompact(stats.totalUtterances)} utterances`} />
        <StatTile label="Avg / active day" value={avgPerActiveDay.toFixed(1)} sub="meetings" />
        <StatTile label="Action items" value={stats.todos.total} sub={`${stats.todos.open} open`} />
      </div>

      <div className="card p-5 mb-6">
        <SectionHead title="Meetings per day" action={<span className="text-xs text-muted">last 30 days</span>} />
        <BarChart data={timeline} height={170} />
        <div className="flex justify-between text-[10px] text-faint mt-2">
          <span>{fmtDateShort(timeline[0]?.date)}</span>
          <span>{fmtDateShort(timeline[timeline.length - 1]?.date)}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <SectionHead title="Talk time by person" />
          {talkRows.length === 0 ? <p className="text-sm text-muted py-4">No data yet.</p> : <RankBars rows={talkRows} />}
        </div>
        <div className="card p-5">
          <SectionHead title="Words spoken" />
          {wordRows.length === 0 ? <p className="text-sm text-muted py-4">No data yet.</p> : <RankBars rows={wordRows} />}
        </div>
      </div>

      <div className="card p-5 mt-6">
        <SectionHead title="Participation" action={<span className="text-xs text-muted">{leaderboard.length} people</span>} />
        <div className="flex items-center gap-6 flex-wrap">
          <Donut value={stats.todos.done} total={stats.todos.total || 1}
            label={`${Math.round((stats.todos.done / (stats.todos.total || 1)) * 100)}%`} sub="tasks done" />
          <div className="flex-1 min-w-[240px]">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {leaderboard.map((p) => (
                <div key={p.displayName} className="flex items-center gap-2.5">
                  <Avatar name={p.displayName} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink truncate">{p.displayName}</div>
                    <div className="text-[11px] text-muted">{p.meetings} meetings · {fmtMs(p.ms)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
