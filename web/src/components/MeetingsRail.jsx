import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

/**
 * Format a meeting timestamp to a short readable label.
 * Accepts ISO strings, SQL datetime strings, or unix-ms integers.
 * Returns e.g. "Jun 28" — lowercase, no year unless it differs.
 */
function fmtDate(raw) {
  if (raw == null || raw === '') return '';
  try {
    // SQLite datetimes may use space instead of T; coerce to ISO
    const d = new Date(typeof raw === 'string' ? raw.replace(' ', 'T') : raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  } catch {
    return String(raw);
  }
}

/**
 * MeetingsRail — the thin left sidebar.
 *
 * Layout decisions (impeccable product register):
 * - Background matches the page bg; the border-r hairline is the divider.
 * - Active item: bg-panel-2 tint (no side-stripe; side-stripe borders are banned).
 * - Hover: bg-panel — one step lighter than the base bg.
 * - Text: same ink on both states; font-medium on active adds a subtle weight cue.
 * - No card boxes, no bullet points, no uppercase labels.
 */
export default function MeetingsRail() {
  const { guildId } = useGuild();
  const [meetings, setMeetings] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  // Re-fetch when the guild changes
  useEffect(() => {
    if (!guildId) {
      setMeetings([]);
      return;
    }
    api.meetings(guildId)
      .then((rows) => setMeetings(Array.isArray(rows) ? rows : []))
      .catch(() => setMeetings([]));
  }, [guildId]);

  // Active meeting id derived from the current pathname (no useParams — this
  // component lives outside the /meetings/:id route boundary).
  const m = location.pathname.match(/^\/meetings\/([^/]+)/);
  const activeId = m ? m[1] : null;

  function handleSearch(e) {
    e.preventDefault();
    const q = searchQ.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <aside
      className="w-[var(--rail-w)] shrink-0 border-r border-edge flex flex-col overflow-hidden bg-bg"
      aria-label="Meetings"
    >
      {/* Search input at the top of the rail */}
      <form
        onSubmit={handleSearch}
        className="px-3 pt-3 pb-0 shrink-0"
        role="search"
      >
        <input
          type="search"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Search…"
          aria-label="Search transcripts"
          className={[
            'w-full bg-transparent text-sm text-ink leading-none',
            'placeholder:text-muted',
            // Hairline underline at rest; primary when focused
            'border-b border-edge pb-2',
            'focus:outline-none focus:border-primary',
            'transition-colors duration-150',
          ].join(' ')}
        />
      </form>

      {/* Hairline separator between search and list */}
      <div className="border-b border-edge mx-0 mt-2" />

      {/* Meeting list */}
      <nav className="flex-1 overflow-y-auto" aria-label="Meeting list">

        {/* Empty states — quiet, no icon needed */}
        {!guildId && (
          <p className="px-3 py-4 text-sm text-muted text-center leading-relaxed">
            No guild selected
          </p>
        )}
        {guildId && meetings.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted text-center leading-relaxed">
            No meetings yet
          </p>
        )}

        {meetings.map((meeting) => {
          const isActive = activeId != null && String(meeting.id) === String(activeId);
          return (
            <Link
              key={meeting.id}
              to={`/meetings/${meeting.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex flex-col gap-0.5 px-3 py-2.5 no-underline',
                'transition-colors duration-150',
                isActive
                  ? 'bg-panel-2'
                  : 'hover:bg-panel',
              ].join(' ')}
            >
              <span
                className={[
                  'text-sm leading-snug',
                  isActive ? 'text-ink font-medium' : 'text-ink',
                ].join(' ')}
              >
                #{meeting.channel_name}
              </span>
              <span className="text-xs text-muted leading-none">
                {fmtDate(meeting.started_at)}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
