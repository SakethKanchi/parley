import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useGuild } from '../GuildContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { Icon } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Icon.Home, end: true },
  { to: '/meetings', label: 'Meetings', icon: Icon.Meetings },
  { to: '/action-items', label: 'Action items', icon: Icon.CheckSquare },
  { to: '/analytics', label: 'Analytics', icon: Icon.Chart },
  { to: '/search', label: 'Search', icon: Icon.Search },
];

function GuildSwitcher() {
  const { guilds, guildId, setGuildId, error } = useGuild();
  if (error) return <span className="text-xs text-error">{error}</span>;
  const current = guilds.find((g) => g.id === guildId);
  return (
    <div className="relative">
      <select
        value={guildId || ''}
        onChange={(e) => setGuildId(e.target.value)}
        aria-label="Select server"
        className="appearance-none bg-surface-2 hover:bg-surface-3 border border-border rounded-sm text-sm font-medium text-ink pl-3 pr-8 py-1.5 cursor-pointer transition-colors focus:outline-none focus:border-primary max-w-[220px] truncate"
      >
        {guilds.length === 0 && <option value="">No servers</option>}
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <Icon.Chevron width={14} height={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-muted" />
    </div>
  );
}

export default function Layout() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  function onSearch(e) {
    e.preventDefault();
    const t = q.trim();
    if (t) navigate(`/search?q=${encodeURIComponent(t)}`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="shrink-0 flex flex-col bg-bg-2 border-r border-border"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <Link to="/" className="flex items-center gap-2.5 px-5 h-[60px] shrink-0 no-underline">
          <span className="grid place-items-center h-8 w-8 rounded-[10px] text-primary-ink shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, var(--accent)))' }}>
            <Icon.Mic width={17} height={17} />
          </span>
          <span className="font-display text-[19px] font-extrabold text-ink tracking-tight">Parley</span>
        </Link>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          <p className="px-2 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Workspace</p>
          {NAV.map(({ to, label, icon: IconC, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <IconC width={18} height={18} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border">
          <NavLink to="/setup" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon.Settings width={18} height={18} className="shrink-0" />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 h-[60px] border-b border-border bg-bg/80 backdrop-blur flex items-center gap-3 px-6">
          <GuildSwitcher />

          <form onSubmit={onSearch} className="relative ml-2 hidden sm:block">
            <Icon.Search width={15} height={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search transcripts…"
              className="bg-surface-2 border border-border rounded-sm text-sm text-ink pl-8 pr-3 py-1.5 w-[240px] focus:w-[320px] transition-all focus:outline-none focus:border-primary placeholder:text-muted"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              className="h-9 w-9 grid place-items-center rounded-sm border border-border text-muted hover:text-ink hover:bg-surface-2 transition-colors"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Icon.Sun width={17} height={17} /> : <Icon.Moon width={17} height={17} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
