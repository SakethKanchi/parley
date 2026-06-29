import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

export default function Search() {
  const { guildId } = useGuild();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [searched, setSearched] = useState(false);
  const run = async (e) => { e.preventDefault(); if (!guildId) return; setRows(await api.search(guildId, q)); setSearched(true); };
  return (
    <div>
      <form onSubmit={run} className="flex gap-2 mb-4">
        <input className="bg-panel border border-edge rounded-md px-3 py-2 text-sm flex-1" placeholder="Search transcripts…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="bg-primary text-white rounded-md px-4 text-sm">Search</button>
      </form>
      <ul className="space-y-2 font-mono text-sm">
        {rows.map((u) => (
          <li key={u.id} className="border border-edge rounded-md p-2 bg-panel">
            <Link to={`/meetings/${u.meeting_id}`} className="text-accent">{u.display_name}</Link>
            <span className="text-muted"> — {u.text}</span>
          </li>
        ))}
      </ul>
      {searched && rows.length === 0 && <div className="text-muted">No matches.</div>}
    </div>
  );
}
