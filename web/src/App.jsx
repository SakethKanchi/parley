import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GuildProvider } from './GuildContext.jsx';
import Layout from './components/Layout.jsx';
import Meetings from './pages/Meetings.jsx';
import MeetingDetail from './pages/MeetingDetail.jsx';
import Todos from './pages/Todos.jsx';
import Search from './pages/Search.jsx';
import Setup from './pages/Setup.jsx';

export default function App() {
  return (
    <GuildProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/meetings" />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/meetings/:id" element={<MeetingDetail />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/search" element={<Search />} />
            <Route path="/setup" element={<Setup />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GuildProvider>
  );
}
