import { useEffect, useState } from 'react';
import { useLive } from '../LiveContext.jsx';
import { AvatarStack, Icon } from './ui.jsx';
import { fmtClock } from '../lib/format.js';

/** Live elapsed time since `startedAt`, ticking once a second. */
export function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = startedAt ? new Date(String(startedAt).replace(' ', 'T')).getTime() : now;
  return Math.max(0, now - start);
}

/** Small pulsing "REC" dot. */
export function RecDot({ size = 8 }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--error)', opacity: 0.55 }} />
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, background: 'var(--error)' }} />
    </span>
  );
}

function StopButton({ channelId, small = false }) {
  const { stop } = useLive();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function run() {
    if (!window.confirm('Stop this recording? Parley will leave the channel and post the notes.')) return;
    setBusy(true); setErr(null);
    try { await stop(channelId); }
    catch (e) { setErr(e?.message || 'Failed to stop.'); setBusy(false); }
  }
  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-error">{err}</span>}
      <button onClick={run} disabled={busy}
        className={`btn btn-ghost !text-error ${small ? '!py-1.5' : '!py-2'}`}>
        {busy
          ? <span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />Stopping…</span>
          : <span className="inline-flex items-center gap-1.5"><Icon.Stop width={14} height={14} />Stop & post notes</span>}
      </button>
    </div>
  );
}

/** A single in-progress recording, with a live timer and stop control. */
export function LiveCard({ session }) {
  const elapsed = useElapsed(session.startedAt);
  const names = (session.attendees || []).map((a) => a.displayName);
  return (
    <div className="card p-5 border-l-2 animate-fade-up" style={{ borderColor: 'var(--error)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <RecDot />
            <span className="text-[11px] font-bold uppercase tracking-wider text-error">Recording</span>
            <span className="chip"><Icon.Hash width={11} height={11} />{session.channelName}</span>
          </div>
          <div className="font-display text-[26px] font-extrabold tabular-nums text-ink leading-none mt-2">
            {fmtClock(elapsed)}
          </div>
          <p className="text-xs text-muted mt-1.5">Meeting #{session.meetingId} · {names.length} {names.length === 1 ? 'person' : 'people'} in the channel</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AvatarStack names={names} size={26} max={6} />
          <StopButton channelId={session.channelId} small />
        </div>
      </div>
    </div>
  );
}
