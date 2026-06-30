import { useState } from 'react';
import { colorOf, toDate } from '../lib/format.js';

/* Dependency-free SVG charts tuned to the design tokens. */

const fmtDay = (key) => {
  const d = toDate(key);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : key;
};
const fmtWeekday = (key) => {
  const d = toDate(key);
  return d ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '';
};

/** Area sparkline with hover crosshair + tooltip and a few date ticks. */
export function Sparkline({ data = [], height = 80, stroke = 'var(--primary)' }) {
  const [hover, setHover] = useState(null);
  if (data.length === 0) return null;
  const width = 600;
  const padX = 6, padTop = 10, padBottom = 18;
  const max = Math.max(1, ...data.map((d) => d.count ?? d));
  const n = data.length;
  const x = (i) => padX + (i / Math.max(1, n - 1)) * (width - padX * 2);
  const y = (v) => padTop + (1 - v / max) * (height - padTop - padBottom);
  const pts = data.map((d, i) => [x(i), y(d.count ?? d)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const baseY = height - padBottom;
  const area = `${line} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z`;
  // ~4 evenly spaced date ticks.
  const tickIdx = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    setHover(i);
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={baseY} x2={width - padX} y2={baseY} stroke="var(--border)" strokeWidth="1" />
        <path d={area} fill="url(#spark)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <g>
            <line x1={pts[hover][0]} y1={padTop} x2={pts[hover][0]} y2={baseY} stroke="var(--border-strong)" strokeWidth="1" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="3.5" fill={stroke} stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        )}
        {hover == null && <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="3" fill={stroke} />}
        {tickIdx.map((i) => (
          <text key={i} x={x(i)} y={height - 4} fontSize="10" fill="var(--faint)"
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{fmtDay(data[i].date)}</text>
        ))}
      </svg>
      {hover != null && (
        <div className="absolute -top-1 px-2 py-1 rounded-md bg-surface-2 border border-border text-[11px] text-ink shadow pointer-events-none whitespace-nowrap"
          style={{ left: `${(pts[hover][0] / width) * 100}%`, transform: 'translate(-50%,-100%)' }}>
          <span className="text-muted">{fmtDay(data[hover].date)}: </span>
          <span className="font-semibold">{data[hover].count}</span>
        </div>
      )}
    </div>
  );
}

/** Vertical bar chart with gridlines, value labels on hover, and a date axis. */
export function BarChart({ data = [], height = 180, color = 'var(--primary)' }) {
  const [hover, setHover] = useState(null);
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  // Horizontal gridlines at sensible counts.
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.ceil(max / 2), max];
  const plotH = height - 22; // leave room for the date axis

  return (
    <div className="select-none">
      <div className="relative flex" style={{ height: plotH }}>
        {/* Y axis labels + gridlines */}
        <div className="relative w-6 shrink-0">
          {ticks.map((t) => (
            <span key={t} className="absolute right-1 -translate-y-1/2 text-[10px] text-faint tabular-nums"
              style={{ bottom: `${(t / max) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute left-0 right-0 border-t border-border/60"
              style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {data.map((d, i) => {
              const h = (d.count / max) * 100;
              const active = hover === i;
              return (
                <div key={i} className="flex-1 relative flex items-end h-full"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <div className="w-full rounded-t-[3px] transition-all"
                    style={{
                      height: `${d.count ? Math.max(4, h) : 1.5}%`,
                      background: d.count ? color : 'var(--surface-3)',
                      opacity: d.count ? (active ? 1 : 0.92) : 0.5,
                      filter: active ? 'brightness(1.15)' : 'none',
                    }} />
                  {active && d.count > 0 && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-1 -translate-y-full px-2 py-1 rounded-md bg-surface-2 border border-border text-[11px] text-ink shadow whitespace-nowrap z-10">
                      <div className="font-semibold">{d.count} meeting{d.count === 1 ? '' : 's'}</div>
                      <div className="text-muted">{fmtWeekday(d.date)} {fmtDay(d.date)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Date axis: a tick roughly weekly */}
      <div className="flex pl-6 mt-1.5">
        {data.map((d, i) => {
          const show = i === 0 || i === data.length - 1 || toDate(d.date)?.getDay() === 1;
          return (
            <div key={i} className="flex-1 text-center text-[10px] text-faint overflow-visible whitespace-nowrap">
              {show ? fmtDay(d.date) : ''}
            </div>
          );
        })}
      </div>
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
