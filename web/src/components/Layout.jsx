import { NavLink, Outlet } from 'react-router-dom';
import { useGuild } from '../GuildContext.jsx';

const tabClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm ${isActive ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`;

export default function Layout() {
  const { guilds, guildId, setGuildId } = useGuild();
  return (
    <div className="min-h-screen">
      <header className="border-b border-edge bg-bg-elevated">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <span className="font-display text-lg text-ink">Parley</span>
          <nav className="flex gap-1">
            <NavLink to="/meetings" className={tabClass}>Meetings</NavLink>
            <NavLink to="/todos" className={tabClass}>TODOs</NavLink>
            <NavLink to="/search" className={tabClass}>Search</NavLink>
            <NavLink to="/setup" className={tabClass}>Setup</NavLink>
          </nav>
          <select className="ml-auto bg-panel border border-edge rounded-md px-2 py-1 text-sm"
            value={guildId || ''} onChange={(e) => setGuildId(e.target.value)}>
            {guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6"><Outlet /></main>
    </div>
  );
}
