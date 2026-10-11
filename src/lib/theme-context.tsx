"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "tokobuku_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Keep the server and hydration snapshots identical; the root layout's
  // beforeInteractive script has already applied the persisted class.
  const [theme, setThemeState] = useState<Theme>("light");
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      let stored: string | null = null;
      try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
      const initial: Theme = stored === "dark" || stored === "light"
        ? stored
        : document.documentElement.classList.contains("dark") ? "dark" : "light";
      document.documentElement.classList.toggle("dark", initial === "dark");
      setThemeState(initial);
      try { localStorage.setItem(STORAGE_KEY, initial); } catch { /* storage may be unavailable */ }
      return;
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      document.documentElement.classList.toggle("dark", next === "dark");
    },
    []
  );

  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
