import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

/* ── helpers ──────────────────────────────────────────────────────────── */

function toDate(raw) {
  if (!raw) return null;
  const d = new Date(typeof raw === 'string' ? raw.replace(' ', 'T') : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Every meeting is the same Discord channel, so the date is what makes a note
// distinct — use it as the title ("Sunday, June 29").
function fmtTitle(raw) {
  const d = toDate(raw);
  if (!d) return String(raw ?? '');
  const now = new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function fmtTime(raw) {
  const d = toDate(raw);
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

function fmtDuration(start, end) {
  if (!start || !end) return null;
  try {
    const ms =
      new Date((end + '').replace(' ', 'T')) -
      new Date((start + '').replace(' ', 'T'));
    if (ms <= 0) return null;
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  } catch { return null; }
}

/* ── loading skeleton ─────────────────────────────────────────────────── */

function DocSkeleton() {
  return (
    <div
      className="max-w-[72ch] mx-auto animate-pulse space-y-8 pt-2 pb-16"
      role="status"
      aria-label="Loading meeting"
    >
      <div className="space-y-2">
        <div className="h-7 bg-panel rounded w-48" />
        <div className="h-3 bg-panel rounded w-32 mt-2" />
      </div>
      <div className="space-y-2.5">
        <div className="h-4 bg-panel rounded w-full" />
        <div className="h-4 bg-panel rounded w-10/12" />
        <div className="h-4 bg-panel rounded w-8/12" />
      </div>
      <div className="space-y-3">
        <div className="h-2.5 bg-panel rounded w-16" />
        {[100, 80, 90, 70].map((w, i) => (
          <div key={i} className="h-4 bg-panel rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="space-y-2.5">
        <div className="h-2.5 bg-panel rounded w-20" />
        {[85, 60, 72].map((w, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 bg-panel rounded" style={{ width: `${w * 0.6}%` }} />
            <div className="h-1.5 bg-panel rounded" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── empty state ──────────────────────────────────────────────────────── */

function EmptyState({ title, body }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center gap-2 py-20">
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && (
        <p className="text-sm text-muted max-w-[38ch] leading-relaxed mt-1">{body}</p>
      )}
    </div>
  );
}

/* ── section wrapper ──────────────────────────────────────────────────── */

function Section({ label, children }) {
  return (
    <section className="mt-8">
      {label && (
        <h2 className="text-xs font-semibold text-muted mb-3">
          {label}
        </h2>
      )}
      {children}
    </section>
  );
}

/* ── action items ─────────────────────────────────────────────────────── */

function ActionItem({ item, todo }) {
  const [done, setDone] = useState(Boolean(todo?.done));
  const [busy, setBusy] = useState(false);

  // Sync if the todo prop itself changes (e.g. todos refetch)
  useEffect(() => {
    if (todo) setDone(Boolean(todo.done));
  }, [todo]);

  async function handleChange() {
    if (!todo || busy) return;
    const next = !done;
    setDone(next); // optimistic
    setBusy(true);
    try {
      const updated = await api.setTodoDone(todo.id, next);
      setDone(Boolean(updated.done));
    } catch {
      setDone(!next); // revert on error
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={done}
        onChange={handleChange}
        disabled={!todo || busy}
        className="pcheck mt-0.5"
        aria-label={item.task}
      />
      <span
        className={[
          'text-sm leading-relaxed',
          done ? 'line-through text-muted' : 'text-ink',
        ].join(' ')}
      >
        {item.assignee && (
          <span className="font-semibold">{item.assignee}:&nbsp;</span>
        )}
        {item.task}
      </span>
    </li>
  );
}

function ActionItems({ items, todos, meetingId }) {
  const meetingTodos = todos.filter(
    (t) => String(t.meeting_id) === String(meetingId),
  );
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => {
        const todo = meetingTodos.find((t) => t.task === item.task) ?? null;
        return <ActionItem key={item.task} item={item} todo={todo} />;
      })}
    </ul>
  );
}

/* ── talk time ────────────────────────────────────────────────────────── */

function TalkTime({ talktime }) {
  return (
    <div className="space-y-3">
      {talktime.map((t, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-ink">{t.displayName}</span>
            <span className="text-muted tabular-nums">{t.pct}%</span>
          </div>
          <div className="h-1.5 bg-panel-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-500"
              style={{ width: `${t.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── transcript ───────────────────────────────────────────────────────── */

function Transcript({ utterances }) {
  const [open, setOpen] = useState(false);

  if (!utterances.length) return null;

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
      >
        <span
          className="inline-block transition-transform duration-200 select-none"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          ▸
        </span>
        <span className="font-medium">
          {open ? 'Hide transcript' : 'Transcript'}
        </span>
        <span className="opacity-60">({utterances.length} lines)</span>
      </button>

      {open && (
        <div className="mt-4 space-y-1.5 font-mono text-sm pl-4 border-l border-edge">
          {utterances.map((u, i) => (
            <p key={i} className="leading-relaxed">
              <span className="text-accent">{u.display_name}</span>
              <span className="text-edge">: </span>
              <span className="text-muted">{u.text}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ask box ──────────────────────────────────────────────────────────── */

function AskBox({ guildId, meetingId }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setAnswer(null);
    setError(null);
    try {
      const res = await api.ask(guildId, meetingId, q);
      setAnswer(res.answer);
    } catch (err) {
      setError(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-12 pt-8 border-t border-edge">
      <h2 className="text-sm font-semibold text-ink mb-4">Ask about this meeting</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What was decided? Who owns what?"
          disabled={loading}
          className={[
            'flex-1 min-w-0 bg-panel text-ink text-sm px-3 py-2 rounded',
            'border border-edge',
            'placeholder:text-muted',
            'focus:outline-none focus:border-primary',
            'disabled:opacity-50',
            'transition-colors duration-150',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className={[
            'px-4 py-2 text-sm font-medium rounded shrink-0',
            'bg-primary text-white',
            'hover:opacity-90',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          ].join(' ')}
        >
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-error leading-relaxed" role="alert">
          {error}
        </p>
      )}

      {answer && (
        <div
          className="mt-5 text-sm text-ink leading-relaxed bg-panel rounded p-4 border border-edge"
          role="region"
          aria-label="Answer"
        >
          {answer}
        </div>
      )}
    </section>
  );
}

/* ── meeting actions (delete / merge) ─────────────────────────────────── */

function MeetingActions({ meeting, meetings }) {
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false); // false | 'pick' | 'busy'
  const [sources, setSources] = useState(() => new Set());
  const [err, setErr] = useState(null);

  const others = (meetings || []).filter((m) => m.id !== meeting.id);

  async function handleDelete() {
    setOpen(false);
    if (!window.confirm('Delete this meeting, its transcript, summary and action items? This cannot be undone.')) return;
    try {
      await api.deleteMeeting(meeting.id);
      window.location.assign('/'); // full reload so the rail drops it too
    } catch (e) { setErr(e?.message || 'Delete failed'); }
  }

  function toggleSource(id) {
    setSources((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleMerge() {
    if (sources.size === 0) return;
    setMerging('busy');
    setErr(null);
    try {
      await api.mergeMeetings(meeting.id, [...sources]);
      window.location.assign(`/meetings/${meeting.id}`); // reload re-summarized note
    } catch (e) {
      setErr(e?.message || 'Merge failed');
      setMerging('pick');
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => { setOpen((v) => !v); setMerging(false); }}
        aria-label="Meeting actions"
        className="h-8 w-8 flex items-center justify-center rounded-md border border-edge text-muted hover:text-ink hover:border-muted transition-colors duration-150 bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && merging === false && (
        <div className="absolute right-0 mt-1 w-44 bg-bg-elevated border border-edge rounded-md shadow-lg py-1 z-10" role="menu">
          <button
            onClick={() => { setMerging('pick'); setOpen(false); }}
            disabled={others.length === 0}
            className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-panel disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
            role="menuitem"
          >
            Merge another meeting…
          </button>
          <button
            onClick={handleDelete}
            className="w-full text-left px-3 py-1.5 text-sm text-error hover:bg-panel cursor-pointer"
            role="menuitem"
          >
            Delete meeting
          </button>
        </div>
      )}

      {merging !== false && (
        <div className="absolute right-0 mt-1 w-80 bg-bg-elevated border border-edge rounded-md shadow-lg p-3 z-10">
          <p className="text-sm font-medium text-ink mb-2">Merge into this note</p>
          <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-0.5">
            {others.map((m) => (
              <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-panel cursor-pointer text-sm">
                <input type="checkbox" className="pcheck h-4 w-4" checked={sources.has(m.id)} onChange={() => toggleSource(m.id)} disabled={merging === 'busy'} />
                <span className="text-ink">{fmtTitle(m.started_at)}</span>
                <span className="text-muted text-xs ml-auto">{fmtTime(m.started_at)} · {m.utterance_count ?? 0}u</span>
              </label>
            ))}
          </div>
          {err && <p className="text-xs text-error mt-2" role="alert">{err}</p>}
          <div className="flex items-center justify-end gap-2 mt-3">
            <button onClick={() => { setMerging(false); setSources(new Set()); setErr(null); }} disabled={merging === 'busy'} className="text-sm text-muted hover:text-ink px-2 py-1 cursor-pointer disabled:opacity-40">Cancel</button>
            <button onClick={handleMerge} disabled={sources.size === 0 || merging === 'busy'} className="text-sm bg-primary text-white rounded px-3 py-1 cursor-pointer disabled:opacity-40">
              {merging === 'busy' ? 'Merging…' : `Merge ${sources.size || ''}`.trim()}
            </button>
          </div>
        </div>
      )}
      {err && merging === false && <p className="text-xs text-error mt-1 absolute right-0 whitespace-nowrap">{err}</p>}
    </div>
  );
}

/* ── note document ────────────────────────────────────────────────────── */

function NoteDocument({ data, todos, guildId, meetings }) {
  const { meeting, summary, attendees, utterances } = data;
  const notes = summary?.notes;
  const duration = fmtDuration(meeting.started_at, meeting.ended_at);

  return (
    <article className="note-enter max-w-[72ch] mx-auto pb-16 pt-2">

      {/* Meeting header */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink leading-tight">
            {fmtTitle(meeting.started_at)}
          </h1>
          <MeetingActions meeting={meeting} meetings={meetings} />
        </div>
        <p className="text-sm text-muted mt-1.5">
          {fmtTime(meeting.started_at)}
          {duration && <span> · {duration}</span>}
          <span> · #{meeting.channel_name}</span>
        </p>
        {attendees?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3" aria-label="Attendees">
            {attendees.map((a) => (
              <span
                key={a.user_id}
                className="px-2 py-0.5 bg-panel text-xs text-muted rounded"
              >
                {a.display_name}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* No summary yet */}
      {!notes && (
        <p className="text-sm text-muted">
          No summary available — status: {meeting.status}.
        </p>
      )}

      {/* Note body */}
      {notes && (
        <>
          {/* TL;DR as opening paragraph — no label */}
          {notes.tldr && (
            <p className="text-[15px] text-ink leading-relaxed mb-8">
              {notes.tldr}
            </p>
          )}

          {notes.topics?.length > 0 && (
            <Section label="Topics">
              <div className="space-y-4">
                {notes.topics.map((topic, i) => (
                  <div key={i}>
                    <h3 className="text-sm font-semibold text-ink">{topic.title}</h3>
                    {topic.points?.length > 0 && (
                      <ul className="mt-1.5 space-y-1 pl-4 list-disc marker:text-edge">
                        {topic.points.map((pt, j) => (
                          <li key={j} className="text-sm text-muted">{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {notes.decisions?.length > 0 && (
            <Section label="Decisions">
              <ul className="space-y-1.5 pl-4 list-disc marker:text-edge">
                {notes.decisions.map((d, i) => (
                  <li key={i} className="text-sm text-ink">{d}</li>
                ))}
              </ul>
            </Section>
          )}

          {notes.openQuestions?.length > 0 && (
            <Section label="Open questions">
              <ul className="space-y-1.5 pl-4 list-disc marker:text-edge">
                {notes.openQuestions.map((q, i) => (
                  <li key={i} className="text-sm text-ink">{q}</li>
                ))}
              </ul>
            </Section>
          )}

          {notes.actionItems?.length > 0 && (
            <Section label="Action items">
              <ActionItems
                items={notes.actionItems}
                todos={todos}
                meetingId={meeting.id}
              />
            </Section>
          )}
        </>
      )}

      {/* Talk time */}
      {summary?.talktime?.length > 0 && (
        <Section label="Talk time">
          <TalkTime talktime={summary.talktime} />
        </Section>
      )}

      {/* Transcript — collapsed by default */}
      <Transcript utterances={utterances ?? []} />

      {/* Ask box */}
      {guildId && <AskBox guildId={guildId} meetingId={meeting.id} />}
    </article>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function Reading() {
  const { id } = useParams();
  const { guildId } = useGuild();

  // Meetings list — used for the index-route redirect to latest
  const [meetings, setMeetings] = useState(null); // null = loading

  // Meeting detail
  const [data, setData] = useState(null);
  const [todos, setTodos] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Fetch meetings list whenever guild changes (needed for redirect)
  useEffect(() => {
    if (!guildId) { setMeetings([]); return; }
    let stale = false;
    setMeetings(null);
    api.meetings(guildId)
      .then((rows) => { if (!stale) setMeetings((Array.isArray(rows) ? rows : []).filter((m) => (m.utterance_count ?? 1) > 0)); })
      .catch(() => { if (!stale) setMeetings([]); });
    return () => { stale = true; };
  }, [guildId]);

  // Fetch meeting detail + todos when id or guild changes
  useEffect(() => {
    if (!id || !guildId) { setData(null); setTodos([]); return; }
    let stale = false;
    setDetailLoading(true);
    setDetailError(null);
    setData(null);
    Promise.all([
      api.meeting(id),
      api.todos(guildId),
    ])
      .then(([meetingData, todosData]) => {
        if (stale) return;
        setData(meetingData);
        setTodos(Array.isArray(todosData) ? todosData : []);
      })
      .catch((err) => {
        if (stale) return;
        setDetailError(err?.message || 'Failed to load meeting');
      })
      .finally(() => { if (!stale) setDetailLoading(false); });
    return () => { stale = true; };
  }, [id, guildId]);

  /* ── index route: redirect to latest meeting ── */
  if (!id) {
    // Still loading guild or meetings list
    if (!guildId || meetings === null) return null;
    if (meetings.length === 0) {
      return (
        <EmptyState
          title="No meetings yet"
          body="Parley will add meeting notes here after your first recorded session."
        />
      );
    }
    return <Navigate to={`/meetings/${meetings[0].id}`} replace />;
  }

  /* ── detail route ── */
  if (detailLoading || data === null) return <DocSkeleton />;

  if (detailError) {
    return <EmptyState title="Couldn't load meeting" body={detailError} />;
  }

  // Key on meeting id so NoteDocument remounts on meeting switch,
  // replaying the note-enter fade animation.
  return (
    <NoteDocument
      key={data.meeting.id}
      data={data}
      todos={todos}
      guildId={guildId}
      meetings={meetings ?? []}
    />
  );
}
