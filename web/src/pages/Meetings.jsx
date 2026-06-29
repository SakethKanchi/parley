import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

export default function Meetings() {
  const { guildId } = useGuild();
  const [rows, setRows] = useState([]);
  useEffect(() => { if (guildId) api.meetings(guildId).then(setRows); }, [guildId]);
  if (!guildId) return <div className="text-muted">No guilds yet.</div>;
  return (
    <ul className="space-y-2">
      {rows.map((m) => (
        <li key={m.id}>
          <Link to={`/meetings/${m.id}`} className="block border border-edge rounded-lg p-3 bg-panel hover:border-primary">
            <div className="flex justify-between">
              <span className="text-ink">#{m.channel_name}</span>
              <span className="text-muted text-sm">{m.started_at}</span>
            </div>
            <span className="text-xs text-muted">status: {m.status}</span>
          </Link>
        </li>
      ))}
      {rows.length === 0 && <li className="text-muted">No meetings recorded.</li>}
    </ul>
  );
}
