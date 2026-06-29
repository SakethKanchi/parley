import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

/* ── loading skeleton ─────────────────────────────────────────────────── */

function SearchSkeleton() {
  return (
    <div
      className="divide-y divide-edge animate-pulse"
      role="status"
      aria-label="Searching"
    >
      {[62, 78, 50].map((w) => (
        <div key={w} className="py-3 space-y-2">
          <div className="h-3.5 bg-panel rounded w-28" />
          <div className="h-3 bg-panel rounded" style={{ width: `${w}%` }} />
          <div className="h-3 bg-panel rounded" style={{ width: `${Math.round(w * 0.7)}%` }} />
        </div>
      ))}
    </div>
  );
}

/* ── result row ───────────────────────────────────────────────────────── */

function ResultRow({ row }) {
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <span className="text-sm font-semibold text-ink">{row.display_name}</span>
        <Link
          to={`/meetings/${row.meeting_id}`}
          className="text-xs text-muted hover:text-ink transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
        >
          View meeting →
        </Link>
      </div>
      <p className="text-sm text-muted leading-relaxed line-clamp-2">{row.text}</p>
    </li>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function Search() {
  const { guildId } = useGuild();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlQ = searchParams.get('q') ?? '';

  const [inputQ, setInputQ] = useState(urlQ);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);

  // Sync the input field when the URL param changes (e.g. navigated from rail)
  useEffect(() => {
    setInputQ(urlQ);
  }, [urlQ]);

  // Run the search whenever the URL query or guild changes
  useEffect(() => {
    const q = urlQ.trim();
    if (!q || !guildId) {
      setRows([]);
      setLoading(false);
      // Only mark as "searched" when a guild is present — prevents the
      // "No matches" empty-state flashing before a guild loads.
      setSearched(guildId ? Boolean(q) : false);
      return;
    }
    let stale = false;
    setLoading(true);
    setError(null);
    api.search(guildId, q)
      .then((data) => {
        if (stale) return;
        setRows(Array.isArray(data) ? data : []);
        setSearched(true);
        setLoading(false);
      })
      .catch((err) => {
        if (stale) return;
        setError(err?.message || 'Search failed');
        setLoading(false);
      });
    return () => { stale = true; };
  }, [urlQ, guildId]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = inputQ.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="max-w-[72ch] mx-auto pb-16 pt-2">

      {/* Page header */}
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-xl font-semibold text-ink leading-tight">
          Search
        </h1>
        <Link
          to="/"
          className="text-xs text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
        >
          ← Back to note
        </Link>
      </header>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
        <input
          type="search"
          value={inputQ}
          onChange={(e) => setInputQ(e.target.value)}
          placeholder="Search transcripts…"
          autoFocus
          className={[
            'flex-1 min-w-0 bg-panel text-ink text-sm px-3 py-2 rounded',
            'border border-edge',
            'placeholder:text-muted',
            'focus:outline-none focus:border-primary',
            'transition-colors duration-150',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={!inputQ.trim()}
          className={[
            'px-4 py-2 text-sm font-medium rounded shrink-0',
            'bg-primary text-white',
            'hover:opacity-90',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          ].join(' ')}
        >
          Search
        </button>
      </form>

      {/* Loading */}
      {loading && <SearchSkeleton />}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {/* Empty */}
      {!loading && !error && searched && rows.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-ink">
            No matches{urlQ ? ` for "${urlQ}"` : ''}
          </p>
          <p className="text-sm text-muted mt-1.5 max-w-[38ch] mx-auto leading-relaxed">
            Try different keywords or a shorter phrase.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && rows.length > 0 && (
        <>
          <p className="text-xs text-muted mb-3">
            {rows.length} {rows.length === 1 ? 'result' : 'results'}
          </p>
          <ul className="divide-y divide-edge" role="list">
            {rows.map((row) => (
              <ResultRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}

    </div>
  );
}
