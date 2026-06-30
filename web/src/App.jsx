import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GuildProvider } from './GuildContext.jsx';
import { SystemProvider, useSystem } from './SystemContext.jsx';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { LiveProvider } from './LiveContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Live from './pages/Live.jsx';
import Meetings from './pages/Meetings.jsx';
import Reading from './pages/Reading.jsx';
import ActionItems from './pages/ActionItems.jsx';
import Analytics from './pages/Analytics.jsx';
import Search from './pages/Search.jsx';
import Commands from './pages/Commands.jsx';
import Setup from './pages/Setup.jsx';
import Account from './pages/Account.jsx';
import NotFound from './pages/NotFound.jsx';

function Spinner() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

// Authenticated shell: onboarding gate + the routed dashboard.
function Shell() {
  const { status, loading } = useSystem();
  if (loading) return <Spinner />;
  // First-run: this server manages the bot but has no Discord credentials yet.
  const needsOnboarding = status?.managed && !status?.bot?.hasCreds && !status?.bot?.connected;
  if (needsOnboarding) return <Onboarding />;

  return (
    <GuildProvider>
      <LiveProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="/live" element={<Live />} />
              <Route path="/meetings" element={<Meetings />} />
              <Route path="/meetings/:id" element={<Reading />} />
              <Route path="/action-items" element={<ActionItems />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/search" element={<Search />} />
              <Route path="/commands" element={<Commands />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LiveProvider>
    </GuildProvider>
  );
}

// Auth gate: show the login screen until a session exists, then mount the
// system-status provider + dashboard shell. If the backend has no auth routes
// (an older server still running), authEnabled is false and we run open so the
// dashboard never gets trapped behind a login it can't satisfy.
function Gate() {
  const { user, authEnabled, loading } = useAuth();
  if (loading) return <Spinner />;
  if (authEnabled && !user) return <Login />;
  return (
    <SystemProvider>
      <Shell />
    </SystemProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
