import { createContext, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
export const useTheme = () => useContext(Ctx);

const STORAGE_KEY = 'parley-theme';
const DEFAULT_THEME = 'dark';

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // storage unavailable — proceed without persistence
    }
  }, [theme]);

  function setTheme(next) {
    setThemeState(next);
  }

  function toggle() {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}
