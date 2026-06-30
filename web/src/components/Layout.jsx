import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useGuild } from '../GuildContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { useAuth } from '../AuthContext.jsx';
import { useLive } from '../LiveContext.jsx';
import { Icon, Logo, Avatar } from './ui.jsx';
import { RecDot } from './Live.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Icon.Home, end: true },
  { to: '/live', label: 'Live', icon: Icon.Radio, live: true },
  { to: '/meetings', label: 'Meetings', icon: Icon.Meetings },
  { to: '/action-items', label: 'Action items', icon: Icon.CheckSquare },
  { to: '/analytics', label: 'Analytics', icon: Icon.Chart },
  { to: '/search', label: 'Search', icon: Icon.Search },
  { to: '/commands', label: 'Commands', icon: Icon.Terminal },
];

function GuildSwitcher() {
  const { guilds, guildId, setGuildId, error } = useGuild();
  if (error) return <span className="text-xs text-error">{error}</span>;
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

// Pill in the top bar that appears whenever something is recording. Click → Live.
function LiveIndicator() {
  const { live } = useLive();
  if (!live.length) return null;
  return (
    <Link to="/live"
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-semibold no-underline transition-colors"
      style={{ color: 'var(--error)', background: 'var(--error-soft)' }}>
      <RecDot />
      {live.length === 1 ? 'Recording' : `${live.length} recording`}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-surface-2 transition-colors"
        aria-label="Account menu"
      >
        <Avatar name={user.username} size={28} />
        <span className="text-sm font-medium text-ink hidden sm:block max-w-[120px] truncate">{user.username}</span>
        <Icon.Chevron width={13} height={13} className="rotate-90 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-52 card shadow-lg p-1.5 z-20 animate-fade-in">
          <div className="px-2.5 py-2 border-b border-border mb-1">
            <p className="text-sm font-semibold text-ink truncate">{user.username}</p>
            <p className="text-xs text-muted truncate">{user.email || (user.isAdmin ? 'Administrator' : 'Member')}</p>
          </div>
          <Link to="/account" className="nav-link !py-2" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
            <Icon.Settings width={16} height={16} />Account & users
          </Link>
          <button onMouseDown={(e) => e.preventDefault()} onClick={logout} className="nav-link !py-2 w-full !text-error">
            <Icon.LogOut width={16} height={16} />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, label, icon: IconC, end, live }) {
  const { live: sessions } = useLive();
  const count = live ? sessions.length : 0;
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <IconC width={18} height={18} className="shrink-0" />
      <span>{label}</span>
      {count > 0 && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--error)' }}>
          <RecDot size={7} />{count}
        </span>
      )}
    </NavLink>
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
          <Logo size={30} className="shrink-0" />
          <span className="font-display text-[19px] font-extrabold text-ink tracking-tight">Parley</span>
        </Link>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          <p className="px-2 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Workspace</p>
          {NAV.map((item) => <NavItem key={item.to} {...item} />)}
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
            <LiveIndicator />
            <button
              onClick={toggle}
              className="h-9 w-9 grid place-items-center rounded-sm border border-border text-muted hover:text-ink hover:bg-surface-2 transition-colors"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Icon.Sun width={17} height={17} /> : <Icon.Moon width={17} height={17} />}
            </button>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
