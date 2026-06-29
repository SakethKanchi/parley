import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

/* Parse SQLite/ISO/unix-ms into a Date (or null). */
function toDate(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(typeof raw === 'string' ? raw.replace(' ', 'T') : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* Primary label for a row: time-of-day for today, weekday for this week,
   else a short date. This is what the eye scans — not the channel. */
function whenLabel(d) {
  if (!d) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/* Time-bucket a meeting into a section header. */
function bucket(d) {
  if (!d) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return 'Earlier';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

export default function MeetingsRail() {
  const { guildId } = useGuild();
  const [meetings, setMeetings] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!guildId) { setMeetings([]); return; }
    let stale = false;
    api.meetings(guildId)
      .then((rows) => { if (!stale) setMeetings(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!stale) setMeetings([]); });
    return () => { stale = true; };
  }, [guildId]);

  const m = location.pathname.match(/^\/meetings\/([^/]+)/);
  const activeId = m ? m[1] : null;

  function handleSearch(e) {
    e.preventDefault();
    const q = searchQ.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  // Group meetings (already newest-first from the API) into ordered buckets.
  const byBucket = new Map();
  for (const meeting of meetings) {
    const b = bucket(toDate(meeting.started_at));
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b).push(meeting);
  }
  const orderedGroups = BUCKET_ORDER.filter((b) => byBucket.has(b));

  return (
    <aside className="w-[var(--rail-w)] shrink-0 border-r border-edge flex flex-col overflow-hidden bg-bg" aria-label="Meetings">
      <form onSubmit={handleSearch} className="px-4 pt-4 pb-3 shrink-0" role="search">
        <input
          type="search"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Search transcripts…"
          aria-label="Search transcripts"
          className="w-full bg-panel text-sm text-ink rounded-md px-3 py-2 leading-none placeholder:text-muted border border-transparent focus:outline-none focus:border-primary focus:bg-transparent transition-colors duration-150"
        />
      </form>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Meeting list">
        {!guildId && <p className="px-2 py-4 text-sm text-muted text-center">No guild selected</p>}
        {guildId && meetings.length === 0 && <p className="px-2 py-4 text-sm text-muted text-center">No meetings yet</p>}

        {orderedGroups.map((b) => (
          <div key={b} className="mb-3">
            <h2 className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted">{b}</h2>
            {byBucket.get(b).map((meeting) => {
              const isActive = activeId != null && String(meeting.id) === String(activeId);
              const d = toDate(meeting.started_at);
              return (
                <Link
                  key={meeting.id}
                  to={`/meetings/${meeting.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'flex items-baseline justify-between gap-2 rounded-md px-2 py-2 no-underline transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-inset',
                    isActive ? 'bg-panel-2' : 'hover:bg-panel',
                  ].join(' ')}
                >
                  <span className={['text-sm leading-snug truncate', isActive ? 'text-ink font-medium' : 'text-ink'].join(' ')}>
                    {whenLabel(d)}
                  </span>
                  <span className="text-xs text-muted shrink-0 leading-snug">#{meeting.channel_name}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
