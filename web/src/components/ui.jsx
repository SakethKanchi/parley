import { colorOf, initials } from '../lib/format.js';

/* ── Icons (lucide-style, 1.75 stroke) ─────────────────────────────────── */
const I = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props} />
);
export const Icon = {
  Home: (p) => <I {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></I>,
  Meetings: (p) => <I {...p}><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5V5.5M16 2.5V5.5" /></I>,
  Check: (p) => <I {...p}><path d="M4 12.5l5 5 11-11" /></I>,
  CheckSquare: (p) => <I {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12l3 3 5-6" /></I>,
  Chart: (p) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>,
  Search: (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></I>,
  Settings: (p) => <I {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.2A1.6 1.6 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></I>,
  Sun: (p) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></I>,
  Moon: (p) => <I {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></I>,
  Clock: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>,
  Users: (p) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M21.5 20a6.5 6.5 0 0 0-5-6.3" /></I>,
  Mic: (p) => <I {...p}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" /></I>,
  Sparkle: (p) => <I {...p}><path d="M12 3l1.8 4.9L18.7 9l-4.9 1.8L12 15.7 10.2 10.8 5.3 9l4.9-1.6L12 3Z" /></I>,
  Arrow: (p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>,
  ArrowUpRight: (p) => <I {...p}><path d="M7 17 17 7M8 7h9v9" /></I>,
  Chevron: (p) => <I {...p}><path d="m9 6 6 6-6 6" /></I>,
  Dots: (p) => <I {...p}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></I>,
  Trash: (p) => <I {...p}><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></I>,
  Merge: (p) => <I {...p}><path d="M7 21V9m0 0 3.5 3.5M7 9 3.5 12.5M17 3v6a6 6 0 0 0 6 6" /><circle cx="7" cy="5" r="2" /></I>,
  Hash: (p) => <I {...p}><path d="M5 9h14M5 15h14M9 4 7 20M17 4l-2 16" /></I>,
  Doc: (p) => <I {...p}><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 17h7" /></I>,
  Calendar: (p) => <I {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9h17M8 2.5v4M16 2.5v4" /></I>,
};

/* ── Brand mark (the real Parley waveform → note logo) ──────────────────── */
export function Logo({ size = 32, rounded = true, className = '' }) {
  // Waveform bars (brand blue) condensing into a single note dash (brand green),
  // matching assets/logo.svg. viewBox is the 512 brand canvas.
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="Parley">
      {rounded && <rect x="6" y="6" width="500" height="500" rx="110" fill="#0A0B0F" />}
      <g stroke="#5865F2" strokeWidth="14" strokeLinecap="round">
        <line x1="140" y1="216" x2="140" y2="296" />
        <line x1="174" y1="190" x2="174" y2="322" />
        <line x1="208" y1="160" x2="208" y2="352" />
        <line x1="242" y1="186" x2="242" y2="326" />
        <line x1="276" y1="208" x2="276" y2="304" />
      </g>
      <line x1="302" y1="256" x2="372" y2="256" stroke="#23A559" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

/* ── Avatar ─────────────────────────────────────────────────────────────── */
export function Avatar({ name, size = 28, ring = false }) {
  const c = colorOf(name);
  return (
    <span
      className="inline-flex items-center justify-center font-semibold shrink-0 select-none"
      title={name}
      style={{
        width: size, height: size, borderRadius: size,
        fontSize: Math.round(size * 0.4),
        color: c,
        background: `color-mix(in srgb, ${c} 18%, transparent)`,
        boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 3px color-mix(in srgb, ${c} 40%, transparent)` : 'none',
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatar stack with a "+N" overflow. */
export function AvatarStack({ names = [], max = 4, size = 26 }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center" style={{ paddingLeft: 4 }}>
      {shown.map((n, i) => (
        <span key={n + i} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
          <span style={{ boxShadow: '0 0 0 2px var(--surface)', borderRadius: size, display: 'inline-flex' }}>
            <Avatar name={n} size={size} />
          </span>
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center font-semibold text-muted bg-surface-3"
          style={{ marginLeft: -8, width: size, height: size, borderRadius: size, fontSize: Math.round(size * 0.38), boxShadow: '0 0 0 2px var(--surface)' }}
          title={names.slice(max).join(', ')}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ── Status pill ────────────────────────────────────────────────────────── */
export function StatusPill({ status }) {
  const map = {
    done: { label: 'Done', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    recording: { label: 'Recording', color: 'var(--error)', bg: 'var(--error-soft)' },
    processing: { label: 'Processing', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  };
  const s = map[status] || { label: status || 'Unknown', color: 'var(--muted)', bg: 'var(--surface-3)' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}>
      <span style={{ width: 5, height: 5, borderRadius: 5, background: s.color }} />
      {s.label}
    </span>
  );
}

/* ── Mini stacked talk-time bar (proportional, speaker-colored) ─────────── */
export function TalkBar({ talktime = [], height = 6 }) {
  const total = talktime.reduce((a, t) => a + (t.pct || 0), 0) || 100;
  return (
    <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
      {talktime.map((t, i) => (
        <span key={i} title={`${t.displayName} · ${t.pct}%`}
          style={{ width: `${(t.pct / total) * 100}%`, background: colorOf(t.displayName) }} />
      ))}
      {talktime.length === 0 && <span className="w-full bg-surface-3" />}
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────── */
export function Empty({ icon: IconC, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      {IconC && (
        <div className="mb-4 h-12 w-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted">
          <IconC width={22} height={22} />
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="text-sm text-muted max-w-[42ch] leading-relaxed mt-1.5">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
