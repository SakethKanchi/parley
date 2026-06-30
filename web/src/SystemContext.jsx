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

  // While the bot is connecting after onboarding, or the local sidecar is
  // booting (model load takes a few seconds), poll until it settles.
  useEffect(() => {
    const botStarting = status?.managed && status.bot?.state === 'starting';
    const sidecarStarting = status?.sidecar?.state === 'starting';
    if (!botStarting && !sidecarStarting) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [status?.bot?.state, status?.managed, status?.sidecar?.state, refresh]);

  return <Ctx.Provider value={{ status, loading, refresh }}>{children}</Ctx.Provider>;
}
