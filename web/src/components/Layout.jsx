import { Link, NavLink, Outlet } from 'react-router-dom';
import { useGuild } from '../GuildContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import MeetingsRail from './MeetingsRail.jsx';

/**
 * Simpler, cleaner gear using a standard cog path that actually renders.
 */
function SettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.5 1C7.22386 1 7 1.22386 7 1.5V2.10555C6.14278 2.27128 5.35881 2.65484 4.70803 3.19619L4.21967 2.70784C4.02441 2.51258 3.70783 2.51258 3.51257 2.70784L2.70786 3.51255C2.5126 3.70781 2.5126 4.02439 2.70786 4.21965L3.19621 4.70801C2.65486 5.35878 2.27130 6.14275 2.10557 7H1.5C1.22386 7 1 7.22386 1 7.5V8.5C1 8.77614 1.22386 9 1.5 9H2.10557C2.27130 9.85725 2.65486 10.6412 3.19621 11.292L2.70786 11.7804C2.5126 11.9756 2.5126 12.2922 2.70786 12.4875L3.51257 13.2922C3.70783 13.4874 4.02441 13.4874 4.21967 13.2922L4.70803 12.8038C5.35881 13.3452 6.14278 13.7287 7 13.8945V14.5C7 14.7761 7.22386 15 7.5 15H8.5C8.77614 15 9 14.7761 9 14.5V13.8945C9.85722 13.7287 10.6412 13.3452 11.292 12.8038L11.7803 13.2922C11.9756 13.4874 12.2922 13.4874 12.4874 13.2922L13.2921 12.4875C13.4874 12.2922 13.4874 11.9756 13.2921 11.7804L12.8038 11.292C13.3451 10.6412 13.7287 9.85725 13.8944 9H14.5C14.7761 9 15 8.77614 15 8.5V7.5C15 7.22386 14.7761 7 14.5 7H13.8944C13.7287 6.14275 13.3451 5.35878 12.8038 4.70801L13.2921 4.21965C13.4874 4.02439 13.4874 3.70781 13.2921 3.51255L12.4874 2.70784C12.2922 2.51258 11.9756 2.51258 11.7803 2.70784L11.292 3.19619C10.6412 2.65484 9.85722 2.27128 9 2.10555V1.5C9 1.22386 8.77614 1 8.5 1H7.5ZM7.5 5C6.11929 5 5 6.11929 5 7.5C5 8.88071 6.11929 10 7.5 10C8.88071 10 10 8.88071 10 7.5C10 6.11929 8.88071 5 7.5 5Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function Layout() {
  const { guilds, guildId, setGuildId, error } = useGuild();
  const { theme, toggle } = useTheme();

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="h-[var(--header-h)] shrink-0 border-b border-edge bg-bg-elevated flex items-center px-4 gap-2"
      >
        {/* Wordmark */}
        <Link
          to="/"
          className="font-display text-[15px] text-ink no-underline shrink-0 leading-none"
        >
          Parley
        </Link>

        {/* Guild picker — inline with the wordmark, feels like context not chrome */}
        <span className="text-edge text-sm select-none" aria-hidden="true">·</span>
        {error ? (
          <span className="text-xs text-muted">{error}</span>
        ) : (
          <select
            className="bg-transparent border-0 text-sm text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm cursor-pointer max-w-[180px] py-0"
            value={guildId || ''}
            onChange={(e) => setGuildId(e.target.value)}
            aria-label="Select guild"
          >
            {guilds.length === 0 && <option value="">No guilds</option>}
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-5">
          {/* Theme toggle — plain text character, no border */}
          <button
            onClick={toggle}
            className="text-muted hover:text-ink transition-colors duration-150 text-[14px] leading-none bg-transparent border-0 cursor-pointer p-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>

          {/* Action items — text link, no underline */}
          <NavLink
            to="/action-items"
            className={({ isActive }) =>
              `text-sm leading-none transition-colors duration-150 no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm ${
                isActive ? 'text-ink' : 'text-muted hover:text-ink'
              }`
            }
          >
            Action items
          </NavLink>

          {/* Gear — icon link to setup */}
          <Link
            to="/setup"
            className="text-muted hover:text-ink transition-colors duration-150 flex items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-sm"
            aria-label="Setup"
          >
            <SettingsIcon />
          </Link>
        </div>
      </header>

      {/* ── Two-pane shell ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <MeetingsRail />
        <main className="flex-1 overflow-y-auto bg-bg px-6 py-5">
          <Outlet />
        </main>
      </div>

    </div>
  );
}
