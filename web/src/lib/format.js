// Shared formatting + small pure helpers used across the dashboard.

/** Parse SQLite/ISO/unix-ms into a Date, or null. */
export function toDate(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(typeof raw === 'string' ? raw.replace(' ', 'T') : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Monday, June 29" (drops year unless different from now). */
export function fmtDateLong(raw) {
  const d = toDate(raw);
  if (!d) return String(raw ?? '');
  const now = new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "Jun 29" short date. */
export function fmtDateShort(raw) {
  const d = toDate(raw);
  if (!d) return '';
  const now = new Date();
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "3:42 PM" */
export function fmtTime(raw) {
  const d = toDate(raw);
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

/** Relative label for lists: time today, "Yesterday", weekday this week, else short date. */
export function fmtRelative(raw) {
  const d = toDate(raw);
  if (!d) return '';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return fmtDateShort(raw);
}

/** Calendar bucket for grouping a meeting list. */
export function bucketOf(raw) {
  const d = toDate(raw);
  if (!d) return 'Earlier';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return 'Earlier';
}
export const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

/** Duration between two timestamps → "1h 12m" / "8 min" / null. */
export function fmtDuration(start, end) {
  const a = toDate(start), b = toDate(end);
  if (!a || !b) return null;
  const ms = b - a;
  if (ms <= 0) return null;
  return fmtMs(ms);
}

/** Milliseconds → compact human duration: "45s" / "8m" / "1h 12m". */
export function fmtMs(ms) {
  if (!ms || ms < 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return `${Math.round(ms / 1000)}s`;
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Milliseconds → "X.Y h" for stat headlines. */
export function fmtHours(ms) {
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  return `${h.toFixed(h < 10 ? 1 : 0)}h`;
}

/** 12345 → "12.3k" */
export function fmtCompact(n) {
  if (n == null) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Deterministic palette index from a name → consistent avatar / speaker color. */
const SPEAKER_COLORS = [
  '#7C82F2', '#3DD68C', '#F2B450', '#F2786E', '#5BC0EB',
  '#C77DFF', '#FF8FAB', '#6EE7B7', '#FBBF77', '#8AB4F8',
];
export function colorOf(name) {
  const s = String(name ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SPEAKER_COLORS[h % SPEAKER_COLORS.length];
}

/** Initials from a display name: "Devin Robinson" → "DR". */
export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** ms offset within a meeting → "12:04" mm:ss (or "1:02:04"). */
export function fmtClock(ms) {
  if (ms == null || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
