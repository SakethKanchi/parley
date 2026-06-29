import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useGuild } from '../GuildContext.jsx';

export default function Todos() {
  const { guildId } = useGuild();
  const [showDone, setShowDone] = useState(false);
  const [rows, setRows] = useState([]);
  const load = useCallback(() => { if (guildId) api.todos(guildId, !showDone).then(setRows); }, [guildId, showDone]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (t) => { await api.setTodoDone(t.id, !t.done); load(); };

  const groups = rows.reduce((acc, t) => { const k = t.assignee || 'Unassigned'; (acc[k] ||= []).push(t); return acc; }, {});
  if (!guildId) return <div className="text-muted">No guilds yet.</div>;
  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-muted mb-4">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show completed
      </label>
      {Object.keys(groups).length === 0 && <div className="text-muted">No open action items.</div>}
      {Object.entries(groups).map(([who, items]) => (
        <div key={who} className="mb-5">
          <h2 className="text-sm uppercase tracking-wide text-muted mb-2">{who}</h2>
          <ul className="space-y-1">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-2 border border-edge rounded-md px-3 py-2 bg-panel">
                <input type="checkbox" checked={!!t.done} onChange={() => toggle(t)} />
                <span className={t.done ? 'line-through text-muted' : 'text-ink'}>{t.task}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
