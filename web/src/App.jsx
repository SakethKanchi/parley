import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GuildProvider } from './GuildContext.jsx';
import Layout from './components/Layout.jsx';
import Reading from './pages/Reading.jsx';
import Todos from './pages/Todos.jsx';
import Search from './pages/Search.jsx';
import Setup from './pages/Setup.jsx';
import ActionItems from './pages/ActionItems.jsx';

export default function App() {
  return (
    <GuildProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Reading />} />
            <Route path="/meetings/:id" element={<Reading />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/action-items" element={<ActionItems />} />
            <Route path="/search" element={<Search />} />
            <Route path="/setup" element={<Setup />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GuildProvider>
  );
}
