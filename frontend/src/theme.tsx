import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppTheme = "light" | "morandi-yellow";

const STORAGE_KEY = "expression-training:theme-v1";
const ThemeContext = createContext<{
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
} | null>(null);

function readTheme(): AppTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "morandi-yellow" ? "morandi-yellow" : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = "light";
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* keep the in-memory preference */ }
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => current === "light" ? "morandi-yellow" : "light"),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme 必须在 ThemeProvider 内使用。");
  return context;
}
