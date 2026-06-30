import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// Auth gate with graceful degradation:
//   • authEnabled === false  → the backend has no /api/auth routes (e.g. an
//     older server still running). Skip the login screen entirely so the
//     dashboard stays usable; real login engages once the backend supports it.
//   • authEnabled === true   → require a session; show Login until one exists.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user, authEnabled: enabled } = await api.me();
      // `authEnabled` is sent by auth-aware servers; default true when present.
      setAuthEnabled(enabled !== false);
      setUser(user || null);
      return user || null;
    } catch (e) {
      // A 404/non-JSON from /auth/me means this server predates auth — run
      // open rather than trapping the user on a login screen it can't satisfy.
      if (e?.status !== 401) setAuthEnabled(false);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password) => {
    const { user } = await api.login(username, password);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  return (
    <Ctx.Provider value={{ user, authEnabled, loading, refresh, login, logout, setUser }}>
      {children}
    </Ctx.Provider>
  );
}
