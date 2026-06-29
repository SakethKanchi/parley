import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useGuild = () => useContext(Ctx);

export function GuildProvider({ children }) {
  const [guilds, setGuilds] = useState([]);
  const [guildId, setGuildId] = useState(null);
  useEffect(() => { api.guilds().then((g) => { setGuilds(g); setGuildId((cur) => cur || g[0]?.id || null); }); }, []);
  return <Ctx.Provider value={{ guilds, guildId, setGuildId }}>{children}</Ctx.Provider>;
}
