import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDateLong, fmtRelative, fmtTime, fmtDuration } from '../lib/format.js';
import { Avatar, AvatarStack, TalkBar, StatusPill, Icon } from './ui.jsx';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function RetranscribeButton({ m, compact = false }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  if (!user?.isAdmin) return null;

  async function retranscribe() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.retranscribeMeeting(m.id);
      if (!result.ok) throw new Error(result.error || result.reason || 'Retranscription failed.');
      setDone(true);
    } catch (e) {
      setError(e?.message || 'Retranscription failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? 'shrink-0' : 'px-5 pb-4'}>
      <button
        type="button"
        onClick={retranscribe}
        disabled={!m.can_retranscribe || busy || done}
        title={m.can_retranscribe
          ? 'Replace the transcript and notes using the retained recording.'
          : 'Original audio is not retained for this meeting.'}
        className="btn btn-ghost !py-1.5 !px-2.5 text-xs"
      >
        <Icon.Refresh width={13} height={13} />
        {busy ? 'Transcribing…' : done ? 'Re-transcribed' : 'Re-transcribe from audio'}
      </button>
      {error && <p role="alert" className="text-[11px] text-error mt-1">{error}</p>}
      {!m.can_retranscribe && !error && !done && !compact && (
        <p className="text-[11px] text-faint mt-1">Audio is not retained.</p>
      )}
    </div>
  );
}

/** Rich meeting card for the Dashboard + Meetings grid. */
export function MeetingCard({ m }) {
  const duration = fmtDuration(m.started_at, m.ended_at);
  return (
    <article className="card card-hover group animate-fade-up">
      <Link to={`/meetings/${m.id}`} className="block p-5 no-underline">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="chip"><Icon.Hash width={12} height={12} />{m.channel_name}</span>
            {!m.has_summary && <StatusPill status={m.status} />}
          </div>
          <span className="text-xs text-muted shrink-0">{fmtRelative(m.started_at)}</span>
        </div>

        <h3 className="font-display text-[17px] font-bold text-ink leading-snug group-hover:text-primary transition-colors">
          {fmtDateLong(m.started_at)}
        </h3>
        <p className="text-xs text-muted mt-0.5">
          {fmtTime(m.started_at)}{duration && ` · ${duration}`}
        </p>

        {m.tldr ? (
          <p className="text-[13.5px] text-ink-2 leading-relaxed mt-3 line-clamp-2">{m.tldr}</p>
        ) : (
          <p className="text-[13.5px] text-muted italic mt-3">No summary yet</p>
        )}

        {m.talktime?.length > 0 && (
          <div className="mt-4">
            <TalkBar talktime={m.talktime} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
          <AvatarStack names={m.attendee_names || []} size={24} max={4} />
          <div className="flex items-center gap-3 text-xs text-muted">
            {m.action_count > 0 && (
              <span className="inline-flex items-center gap-1" title="Action items">
                <Icon.CheckSquare width={13} height={13} />
                {m.open_action_count}/{m.action_count}
              </span>
            )}
            <span className="inline-flex items-center gap-1" title="Utterances">
              <Icon.Mic width={13} height={13} />
              {m.utterance_count}
            </span>
          </div>
        </div>
      </Link>
      <RetranscribeButton m={m} />
    </article>
  );
}

/** Compact one-line meeting row for lists. */
export function MeetingRow({ m }) {
  const duration = fmtDuration(m.started_at, m.ended_at);
  return (
    <div className="flex items-center gap-2">
      <Link to={`/meetings/${m.id}`}
        className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 rounded-sm hover:bg-surface-2 transition-colors no-underline group">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">
              {fmtDateLong(m.started_at)}
            </span>
            <span className="chip shrink-0"><Icon.Hash width={11} height={11} />{m.channel_name}</span>
          </div>
          {m.tldr && <p className="text-xs text-muted truncate mt-0.5">{m.tldr}</p>}
        </div>
        <div className="hidden md:block w-28 shrink-0"><TalkBar talktime={m.talktime} /></div>
        <AvatarStack names={m.attendee_names || []} size={22} max={3} />
        <span className="text-xs text-muted w-16 text-right shrink-0">{duration || '—'}</span>
        <span className="text-xs text-muted w-20 text-right shrink-0">{fmtRelative(m.started_at)}</span>
      </Link>
      <RetranscribeButton m={m} compact />
    </div>
  );
}
