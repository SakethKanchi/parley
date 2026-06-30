import { colorOf } from '../lib/format.js';

/* Dependency-free SVG charts tuned to the design tokens. */

/** Smooth-ish area sparkline of a numeric series. */
export function Sparkline({ data = [], width = 560, height = 64, stroke = 'var(--primary)' }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count ?? d));
  const n = data.length;
  const x = (i) => (i / Math.max(1, n - 1)) * width;
  const y = (v) => height - 4 - (v / max) * (height - 10);
  const pts = data.map((d, i) => [x(i), y(d.count ?? d)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={stroke} />}
    </svg>
  );
}

/** Vertical bar chart (meetings per day). */
export function BarChart({ data = [], height = 160, color = 'var(--primary)' }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.count / max) * 100;
        return (
          <div key={i} className="flex-1 group relative flex items-end" style={{ height: '100%' }}>
            <div
              className="w-full rounded-t-[3px] transition-all"
              style={{
                height: `${Math.max(d.count ? 6 : 1.5, h)}%`,
                background: d.count ? color : 'var(--surface-3)',
                opacity: d.count ? 1 : 0.6,
              }}
              title={`${d.date}: ${d.count} meeting${d.count === 1 ? '' : 's'}`}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal ranked bars (talk-time leaderboard). value is the bar fraction 0..1. */
export function RankBars({ rows = [] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.label + i}>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-ink font-medium truncate">{r.label}</span>
            <span className="text-muted tabular-nums shrink-0 ml-2">{r.display}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color || colorOf(r.label) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut for a single completion ratio. */
export function Donut({ value = 0, total = 1, size = 96, label, sub }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="9"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="font-display text-lg font-bold text-ink">{label}</div>
          {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
