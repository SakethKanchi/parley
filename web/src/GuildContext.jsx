import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useGuild = () => useContext(Ctx);

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([]);
  const [guildId, setGuildId] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.guilds()
      .then((g) => { setGuilds(g); setGuildId((cur) => cur || g[0]?.id || null); })
      .catch((err) => { setGuilds([]); setError(err?.message ?? 'Failed to load guilds'); });
  }, []);
  return <Ctx.Provider value={{ guilds, guildId, setGuildId, error }}>{children}</Ctx.Provider>;
}
