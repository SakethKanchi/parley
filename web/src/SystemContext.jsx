import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useSystem = () => useContext(Ctx);

export function SystemProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.systemStatus();
      setStatus(s);
      return s;
    } catch {
      // Older server without /system/status: treat as fully configured so the
      // app still renders (the endpoint is additive).
      setStatus((cur) => cur || { managed: false, bot: { hasCreds: true, connected: false } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // While the bot is connecting after onboarding, poll until it settles.
  useEffect(() => {
    if (!status?.managed) return;
    const st = status.bot?.state;
    if (st !== 'starting') return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [status?.bot?.state, status?.managed, refresh]);

  return <Ctx.Provider value={{ status, loading, refresh }}>{children}</Ctx.Provider>;
}
