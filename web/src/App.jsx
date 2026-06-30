import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GuildProvider } from './GuildContext.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Meetings from './pages/Meetings.jsx';
import Reading from './pages/Reading.jsx';
import ActionItems from './pages/ActionItems.jsx';
import Analytics from './pages/Analytics.jsx';
import Search from './pages/Search.jsx';
import Setup from './pages/Setup.jsx';

export default function App() {
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
            <Route path="/setup" element={<Setup />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GuildProvider>
  );
}
