import { Link } from 'react-router-dom';
import { fmtDateLong, fmtRelative, fmtTime, fmtDuration } from '../lib/format.js';
import { Avatar, AvatarStack, TalkBar, StatusPill, Icon } from './ui.jsx';

/** Rich meeting card for the Dashboard + Meetings grid. */
export function MeetingCard({ m }) {
  const duration = fmtDuration(m.started_at, m.ended_at);
  return (
    <Link
      to={`/meetings/${m.id}`}
      className="card card-hover group block p-5 no-underline animate-fade-up"
    >
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
  );
}

/** Compact one-line meeting row for lists. */
export function MeetingRow({ m }) {
  const duration = fmtDuration(m.started_at, m.ended_at);
  return (
    <Link to={`/meetings/${m.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-sm hover:bg-surface-2 transition-colors no-underline group">
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
  );
}
