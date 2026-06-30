import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';
import { useLive } from '../LiveContext.jsx';
import { Page, PageHead, SectionHead } from '../components/Page.jsx';
import { MeetingCard } from '../components/MeetingCard.jsx';
import { LiveCard } from '../components/Live.jsx';
import { Sparkline, RankBars } from '../components/charts.jsx';
import { Avatar, Icon, Empty } from '../components/ui.jsx';
import { fmtHours, fmtCompact, fmtMs, colorOf } from '../lib/format.js';

function StatCard({ icon: IconC, label, value, sub, tint = 'var(--primary)' }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="grid place-items-center h-9 w-9 rounded-[10px]"
          style={{ color: tint, background: `color-mix(in srgb, ${tint} 14%, transparent)` }}>
          <IconC width={18} height={18} />
        </span>
      </div>
      <div className="stat-value text-ink mt-3">{value}</div>
      <div className="text-sm text-muted mt-1">{label}</div>
      {sub && <div className="text-xs text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <Page>
      <div className="h-8 w-48 skeleton mb-7" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 skeleton rounded-[14px]" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 skeleton rounded-[14px]" />)}
        </div>
        <div className="h-80 skeleton rounded-[14px]" />
      </div>
    </Page>
  );
}

export default function Dashboard() {
  const { guildId } = useGuild();
  const { live } = useLive();
  const [meetings, setMeetings] = useState(null);
  const [agg, setAgg] = useState(null);
  const [todos, setTodos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!guildId) return;
    let stale = false;
    setMeetings(null); setAgg(null); setError(null);
    Promise.all([
      api.meetings(guildId),
      api.stats(guildId),
      api.todos(guildId, { open: true }),
    ]).then(([m, a, t]) => {
      if (stale) return;
      setMeetings((Array.isArray(m) ? m : []).filter((x) => (x.utterance_count ?? 1) > 0));
      setAgg(a);
      setTodos(Array.isArray(t) ? t : []);
    }).catch((e) => { if (!stale) setError(e?.message || 'Failed to load'); });
    return () => { stale = true; };
  }, [guildId]);

  if (!guildId) return <Page><Empty icon={Icon.Home} title="No server selected" body="Pick a Discord server from the switcher to see its dashboard." /></Page>;
  if (error) return <Page><Empty icon={Icon.Home} title="Couldn't load dashboard" body={error} /></Page>;
  if (!meetings || !agg) return <StatSkeleton />;

  const { stats, leaderboard, timeline } = agg;
  const recent = meetings.slice(0, 4);
  const lbRows = leaderboard.slice(0, 5).map((p) => ({
    label: p.displayName, value: p.ms, display: fmtMs(p.ms), color: colorOf(p.displayName),
  }));
  const openTodos = todos.slice(0, 6);

  return (
    <Page>
      <PageHead
        title="Dashboard"
        subtitle={`${stats.totalMeetings} meetings · ${stats.people} people · ${fmtCompact(stats.totalUtterances)} utterances captured`}
        actions={<Link to="/meetings" className="btn btn-ghost">All meetings <Icon.Arrow width={15} height={15} /></Link>}
      />

      {/* Live recordings in progress */}
      {live.length > 0 && (
        <div className="space-y-4 mb-8">
          {live.map((s) => <LiveCard key={`${s.guildId}:${s.channelId}`} session={s} />)}
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Icon.Meetings} label="Meetings recorded" value={stats.totalMeetings} sub={`${stats.doneMeetings} summarized`} tint="var(--primary)" />
        <StatCard icon={Icon.Clock} label="Total talk time" value={fmtHours(stats.totalTalkMs)} sub={`${fmtCompact(stats.totalUtterances)} utterances`} tint="#5BC0EB" />
        <StatCard icon={Icon.CheckSquare} label="Open action items" value={stats.todos.open} sub={`${stats.todos.done} completed`} tint="var(--accent)" />
        <StatCard icon={Icon.Users} label="People" value={stats.people} sub="across all meetings" tint="#C77DFF" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: recent meetings + activity */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <SectionHead title="Activity" action={<span className="text-xs text-muted">last 30 days</span>} />
            <Sparkline data={timeline} height={96} />
          </div>

          <div>
            <SectionHead title="Recent meetings" action={<Link to="/meetings" className="text-xs text-primary font-medium hover:underline">View all</Link>} />
            {recent.length === 0 ? (
              <div className="card"><Empty icon={Icon.Meetings} title="No meetings yet" body="Recorded meetings will appear here once Parley captures a session." /></div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {recent.map((m) => <MeetingCard key={m.id} m={m} />)}
              </div>
            )}
          </div>
        </div>

        {/* Right: leaderboard + open items */}
        <div className="space-y-6">
          <div className="card p-5">
            <SectionHead title="Top speakers" action={<Link to="/analytics" className="text-xs text-primary font-medium hover:underline">Analytics</Link>} />
            {lbRows.length === 0 ? <p className="text-sm text-muted py-4">No talk-time data yet.</p> : <RankBars rows={lbRows} />}
          </div>

          <div className="card p-5">
            <SectionHead title="Open action items" action={<Link to="/action-items" className="text-xs text-primary font-medium hover:underline">All</Link>} />
            {openTodos.length === 0 ? (
              <p className="text-sm text-muted py-4">All caught up. No open tasks.</p>
            ) : (
              <ul className="space-y-2.5">
                {openTodos.map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5">
                    {t.assignee
                      ? <Avatar name={t.assignee} size={22} />
                      : <span className="h-[22px] w-[22px] rounded-full bg-surface-3 grid place-items-center text-[10px] text-muted shrink-0">?</span>}
                    <div className="min-w-0">
                      <Link to={`/meetings/${t.meeting_id}`} className="text-[13px] text-ink-2 leading-snug hover:text-ink line-clamp-2 no-underline">{t.task}</Link>
                      {t.assignee && <div className="text-[11px] text-muted mt-0.5">{t.assignee}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
