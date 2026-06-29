import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

/* ── sentinels ────────────────────────────────────────────────────────────
   Symbols so `===` is unambiguous and no sentinel string can collide with a
   real person name or day key.
────────────────────────────────────────────────────────────────────────── */
const ALL_ASSIGNEES = Symbol('all-assignees');
const ALL_DAYS = Symbol('all-days');

/* ── assignee parsing ─────────────────────────────────────────────────────
   The summarizer stores multi-person action items as one comma-joined string
   ("Devin Robinson, Vineel"). Split so each person is a clean filter option
   and a shared task shows up under every assignee it names. `null` = the
   Unassigned bucket (no names). Name variants like "Devin" vs "Devin Robinson"
   are left distinct — we can't safely merge them.
────────────────────────────────────────────────────────────────────────── */
function splitAssignees(s) {
  if (s == null) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function matchesAssignee(todo, filter) {
  if (filter === ALL_ASSIGNEES) return true;
  if (filter === null) return todo.assignee == null;
  return splitAssignees(todo.assignee).includes(filter);
}

/* ── day helpers ──────────────────────────────────────────────────────────
   Group by LOCAL calendar day of `created_at` (when the meeting was
   summarized). Latest day first; "today" is the freshest batch.
────────────────────────────────────────────────────────────────────────── */
function localDayKey(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(key) {
  const now = new Date();
  const today = localDayKey(now.toISOString());
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = localDayKey(y.toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const [yr, mo, dy] = key.split('-').map(Number);
  return new Date(yr, mo - 1, dy).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/* ── empty state ──────────────────────────────────────────────────────────*/

function EmptyState({ showCompleted, scopeLabel }) {
  const qualifier = showCompleted ? '' : 'open ';
  const subtitle = showCompleted
    ? 'Action items will appear here once meetings have been summarized.'
    : 'All caught up. No open tasks here.';
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center gap-2 py-20">
      <p className="text-sm font-medium text-ink">
        No {qualifier}action items{scopeLabel ? ` ${scopeLabel}` : ''}
      </p>
      <p className="text-sm text-muted max-w-[38ch] leading-relaxed mt-1">{subtitle}</p>
    </div>
  );
}

/* ── loading skeleton ─────────────────────────────────────────────────────*/

function Skeleton() {
  return (
    <div className="space-y-px animate-pulse" role="status" aria-label="Loading action items">
      {[92, 78, 85, 63, 80, 71].map((w) => (
        <div key={w} className="flex items-start gap-3 px-3 py-2.5 rounded">
          <div className="mt-0.5 h-3.5 w-3.5 bg-panel-2 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-panel-2 rounded" style={{ width: `${w}%` }} />
            <div className="h-2.5 bg-panel rounded" style={{ width: `${Math.round(w * 0.42)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── single todo row ──────────────────────────────────────────────────────*/

function TodoRow({ todo, onToggle }) {
  const [busy, setBusy] = useState(false);
  const done = Boolean(todo.done);

  async function handleChange() {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(todo);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-3 px-3 py-2.5 rounded hover:bg-panel transition-colors duration-100">
      <input
        type="checkbox"
        checked={done}
        onChange={handleChange}
        disabled={busy}
        className="mt-0.5 shrink-0 accent-primary cursor-pointer disabled:cursor-default disabled:opacity-50"
        aria-label={todo.task}
      />
      <div className="min-w-0 flex-1">
        <span className={['text-sm leading-relaxed block', done ? 'line-through text-muted' : 'text-ink'].join(' ')}>
          {todo.task}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted">{todo.assignee ?? 'Unassigned'}</span>
          <span className="text-edge text-xs leading-none select-none" aria-hidden="true">·</span>
          <Link
            to={`/meetings/${todo.meeting_id}`}
            className="text-xs text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
          >
            View meeting
          </Link>
        </div>
      </div>
    </li>
  );
}

/* ── select control ───────────────────────────────────────────────────────*/

function Select({ value, onChange, label, children }) {
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={onChange}
        aria-label={label}
        className="appearance-none bg-panel text-ink text-sm pl-3 pr-8 py-1.5 rounded border border-edge focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus:border-primary cursor-pointer transition-colors duration-150"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted leading-none select-none" aria-hidden="true">▾</span>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────*/

export default function ActionItems() {
  const { guildId } = useGuild();

  const [assigneeFilter, setAssigneeFilter] = useState(ALL_ASSIGNEES);
  const [showCompleted, setShowCompleted] = useState(false);
  // null → follow the latest available day; ALL_DAYS → every day; string → that day key
  const [selectedDay, setSelectedDay] = useState(null);
  const [version, setVersion] = useState(0); // bump to refetch after a toggle

  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Reset filters on guild switch so a stale person/day can't linger
  useEffect(() => {
    setAssigneeFilter(ALL_ASSIGNEES);
    setShowCompleted(false);
    setSelectedDay(null);
  }, [guildId]);

  // Fetch all todos for the guild (open-only unless showing completed). Assignee
  // and day filtering happen client-side — the stored assignee strings are
  // comma-compound, so a server `assignee = ?` match can't be trusted.
  useEffect(() => {
    if (!guildId) { setTodos([]); setLoading(false); return; }
    let stale = false;
    setLoading(true);
    setError(null);
    api.todos(guildId, showCompleted ? {} : { open: true })
      .then((rows) => { if (!stale) { setTodos(Array.isArray(rows) ? rows : []); setLoading(false); } })
      .catch((err) => { if (!stale) { setError(err?.message || 'Failed to load action items'); setLoading(false); } });
    return () => { stale = true; };
  }, [guildId, showCompleted, version]);

  async function handleToggle(todo) {
    await api.setTodoDone(todo.id, !todo.done);
    setVersion((v) => v + 1);
  }

  // People list from ALL todos (independent of the day filter) so switching day
  // never hides a person from the dropdown.
  const { people, hasUnassigned } = useMemo(() => {
    const set = new Set();
    let unassigned = false;
    for (const t of todos) {
      const names = splitAssignees(t.assignee);
      if (names.length === 0) unassigned = true;
      names.forEach((n) => set.add(n));
    }
    return { people: [...set].sort((a, b) => a.localeCompare(b)), hasUnassigned: unassigned };
  }, [todos]);

  // Apply the assignee filter, then derive the available days within that scope.
  const byAssignee = useMemo(
    () => todos.filter((t) => matchesAssignee(t, assigneeFilter)),
    [todos, assigneeFilter],
  );
  const days = useMemo(() => {
    const set = new Set(byAssignee.map((t) => localDayKey(t.created_at)));
    return [...set].sort().reverse(); // newest first
  }, [byAssignee]);

  // null/unknown selection → newest day. ALL_DAYS → keep. Otherwise the picked
  // day if it still exists in scope, else fall back to newest.
  const effectiveDay =
    selectedDay === ALL_DAYS ? ALL_DAYS
    : (typeof selectedDay === 'string' && days.includes(selectedDay)) ? selectedDay
    : (days[0] ?? null);

  const visible = useMemo(
    () => (effectiveDay === ALL_DAYS
      ? byAssignee
      : byAssignee.filter((t) => localDayKey(t.created_at) === effectiveDay)),
    [byAssignee, effectiveDay],
  );

  function handleAssigneeChange(e) {
    const v = e.target.value;
    if (v === '__all__') setAssigneeFilter(ALL_ASSIGNEES);
    else if (v === '__unassigned__') setAssigneeFilter(null);
    else setAssigneeFilter(v);
  }

  function handleDayChange(e) {
    const v = e.target.value;
    setSelectedDay(v === '__all_days__' ? ALL_DAYS : v);
  }

  const assigneeValue =
    assigneeFilter === ALL_ASSIGNEES ? '__all__'
    : assigneeFilter === null ? '__unassigned__'
    : assigneeFilter;
  const dayValue = effectiveDay === ALL_DAYS ? '__all_days__' : (effectiveDay ?? '__all_days__');

  const scopeLabel =
    effectiveDay && effectiveDay !== ALL_DAYS ? `for ${dayLabel(effectiveDay)}` : '';

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center py-20">
        <p className="text-sm text-muted">No guild selected.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[72ch] mx-auto pb-16 pt-2">
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-ink leading-tight">Action items</h1>
      </header>

      {/* Controls: assignee + day are the primary filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Select value={assigneeValue} onChange={handleAssigneeChange} label="Filter by assignee">
          <option value="__all__">All assignees</option>
          {hasUnassigned && <option value="__unassigned__">Unassigned</option>}
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>

        <Select value={dayValue} onChange={handleDayChange} label="Filter by day">
          {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
          <option value="__all_days__">All days</option>
        </Select>

        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-primary cursor-pointer"
          />
          Show completed
        </label>
      </div>

      {loading && <Skeleton />}

      {!loading && error && (
        <p className="text-sm text-error py-4" role="alert">Could not load action items: {error}</p>
      )}

      {!loading && !error && visible.length === 0 && (
        <EmptyState showCompleted={showCompleted} scopeLabel={scopeLabel} />
      )}

      {!loading && !error && visible.length > 0 && (
        effectiveDay === ALL_DAYS ? (
          // Grouped by day, newest first
          days
            .filter((d) => visible.some((t) => localDayKey(t.created_at) === d))
            .map((d) => (
              <section key={d} className="mb-6">
                <h2 className="text-xs font-semibold text-muted mb-1.5 px-3">{dayLabel(d)}</h2>
                <ul className="space-y-px" role="list">
                  {visible
                    .filter((t) => localDayKey(t.created_at) === d)
                    .map((todo) => <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} />)}
                </ul>
              </section>
            ))
        ) : (
          <ul className="space-y-px" role="list">
            {visible.map((todo) => <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} />)}
          </ul>
        )
      )}
    </div>
  );
}
