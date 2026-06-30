import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GuildProvider } from './GuildContext.jsx';
import { SystemProvider, useSystem } from './SystemContext.jsx';
import Layout from './components/Layout.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Meetings from './pages/Meetings.jsx';
import Reading from './pages/Reading.jsx';
import ActionItems from './pages/ActionItems.jsx';
import Analytics from './pages/Analytics.jsx';
import Search from './pages/Search.jsx';
import Commands from './pages/Commands.jsx';
import Setup from './pages/Setup.jsx';
import NotFound from './pages/NotFound.jsx';

function Gate() {
  const { status, loading } = useSystem();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  // First-run: this server manages the bot but has no Discord credentials yet.
  // Show onboarding until the bot is connected (or at least has creds saved).
  const needsOnboarding = status?.managed && !status?.bot?.hasCreds && !status?.bot?.connected;
  if (needsOnboarding) return <Onboarding />;

  return (
    <GuildProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/meetings/:id" element={<Reading />} />
            <Route path="/action-items" element={<ActionItems />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/search" element={<Search />} />
            <Route path="/commands" element={<Commands />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GuildProvider>
  );
}

export default function App() {
  return (
    <SystemProvider>
      <Gate />
    </SystemProvider>
  );
}
