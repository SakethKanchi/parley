import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

/* ── sentinel ─────────────────────────────────────────────────────────────
   Distinct from `null` (Unassigned) and any string (a named person).
   Using a Symbol means `===` comparison is safe and no string sentinel
   leaks into the URL-param or API call.
────────────────────────────────────────────────────────────────────────── */
const ALL_ASSIGNEES = Symbol('all');

/* ── helpers ──────────────────────────────────────────────────────────── */

function buildOpts(assigneeFilter, showCompleted) {
  const opts = {};
  if (!showCompleted) opts.open = true;
  // ALL_ASSIGNEES → no assignee key (no filter)
  // null          → server maps to "Unassigned" bucket
  // string        → that person
  if (assigneeFilter !== ALL_ASSIGNEES) opts.assignee = assigneeFilter;
  return opts;
}

/* ── empty state ──────────────────────────────────────────────────────── */

function EmptyState({ showCompleted, assigneeLabel }) {
  const qualifier = showCompleted ? '' : 'open ';
  const filter =
    assigneeLabel && assigneeLabel !== 'All assignees'
      ? ` for ${assigneeLabel}`
      : '';
  const subtitle = showCompleted
    ? 'Action items will appear here once meetings have been summarized.'
    : 'All caught up. No open tasks right now.';
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center gap-2 py-20">
      <p className="text-sm font-medium text-ink">
        No {qualifier}action items{filter}
      </p>
      <p className="text-sm text-muted max-w-[38ch] leading-relaxed mt-1">
        {subtitle}
      </p>
    </div>
  );
}

/* ── loading skeleton ─────────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div
      className="space-y-px animate-pulse"
      role="status"
      aria-label="Loading action items"
    >
      {[92, 78, 85, 63, 80, 71].map((w, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded">
          <div className="mt-0.5 h-3.5 w-3.5 bg-panel-2 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-panel-2 rounded" style={{ width: `${w}%` }} />
            <div
              className="h-2.5 bg-panel rounded"
              style={{ width: `${Math.round(w * 0.42)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── single todo row ──────────────────────────────────────────────────── */

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
        <span
          className={[
            'text-sm leading-relaxed block',
            done ? 'line-through text-muted' : 'text-ink',
          ].join(' ')}
        >
          {todo.task}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted">
            {todo.assignee ?? 'Unassigned'}
          </span>
          <span
            className="text-edge text-xs leading-none select-none"
            aria-hidden="true"
          >
            ·
          </span>
          <Link
            to={`/meetings/${todo.meeting_id}`}
            className="text-xs text-muted hover:text-ink transition-colors duration-150"
          >
            View meeting
          </Link>
        </div>
      </div>
    </li>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function ActionItems() {
  const { guildId } = useGuild();

  // Filter state
  const [assigneeFilter, setAssigneeFilter] = useState(ALL_ASSIGNEES);
  const [showCompleted, setShowCompleted] = useState(false);

  // Bump to re-trigger the todos effect after a checkbox toggle
  const [version, setVersion] = useState(0);

  // Data
  const [todos, setTodos] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch assignee list whenever the guild changes
  useEffect(() => {
    if (!guildId) { setAssignees([]); return; }
    let stale = false;
    api.assignees(guildId)
      .then((rows) => { if (!stale) setAssignees(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!stale) setAssignees([]); });
    return () => { stale = true; };
  }, [guildId]);

  // Fetch todos whenever guild, filter, or version changes
  useEffect(() => {
    if (!guildId) { setTodos([]); setLoading(false); return; }
    let stale = false;
    setLoading(true);
    setError(null);
    api.todos(guildId, buildOpts(assigneeFilter, showCompleted))
      .then((rows) => {
        if (!stale) {
          setTodos(Array.isArray(rows) ? rows : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!stale) {
          setError(err?.message || 'Failed to load action items');
          setLoading(false);
        }
      });
    return () => { stale = true; };
  }, [guildId, assigneeFilter, showCompleted, version]);

  // Toggle a todo and refetch the current view
  async function handleToggle(todo) {
    await api.setTodoDone(todo.id, !todo.done);
    setVersion((v) => v + 1);
  }

  // Native <select> requires a string value
  const selectValue =
    assigneeFilter === ALL_ASSIGNEES ? '__all__'
    : assigneeFilter === null ? '__unassigned__'
    : assigneeFilter;

  function handleAssigneeChange(e) {
    const v = e.target.value;
    if (v === '__all__') setAssigneeFilter(ALL_ASSIGNEES);
    else if (v === '__unassigned__') setAssigneeFilter(null);
    else setAssigneeFilter(v);
  }

  const assigneeLabel =
    assigneeFilter === ALL_ASSIGNEES ? 'All assignees'
    : assigneeFilter === null ? 'Unassigned'
    : assigneeFilter;

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center py-20">
        <p className="text-sm text-muted">No guild selected.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[72ch] mx-auto pb-16 pt-2">

      {/* Page header */}
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-ink leading-tight">
          Action items
        </h1>
      </header>

      {/* Controls bar */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">

        {/* Assignee dropdown — primary filter control */}
        <div className="relative inline-flex">
          <select
            value={selectValue}
            onChange={handleAssigneeChange}
            aria-label="Filter by assignee"
            className={[
              'appearance-none',
              'bg-panel text-ink text-sm',
              'pl-3 pr-8 py-1.5',
              'rounded border border-edge',
              'focus:outline-none focus:border-primary',
              'cursor-pointer',
              'transition-colors duration-150',
            ].join(' ')}
          >
            <option value="__all__">All assignees</option>
            <option value="__unassigned__">Unassigned</option>
            {assignees
              .filter((a) => a.assignee !== null)
              .map((a) => (
                <option key={a.assignee} value={a.assignee}>
                  {a.assignee}
                </option>
              ))}
          </select>
          {/* Custom dropdown caret — native one hidden by appearance-none */}
          <span
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted leading-none select-none"
            aria-hidden="true"
          >
            ▾
          </span>
        </div>

        {/* Show completed toggle */}
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-primary cursor-pointer"
          />
          Show completed
        </label>

      </div>

      {/* List area */}
      {loading && <Skeleton />}

      {!loading && error && (
        <p className="text-sm text-muted py-4" role="alert">
          Could not load action items: {error}
        </p>
      )}

      {!loading && !error && todos.length === 0 && (
        <EmptyState showCompleted={showCompleted} assigneeLabel={assigneeLabel} />
      )}

      {!loading && !error && todos.length > 0 && (
        <ul className="space-y-px" role="list">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} />
          ))}
        </ul>
      )}

    </div>
  );
}
