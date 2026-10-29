export const THEME_STORAGE_KEY = "herb-overflow-theme";

export const THEME_INITIALIZER = `(() => {
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme = saved === "day" || saved === "night" ? saved : "day";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "day" ? "light" : "dark";
  } catch {
    document.documentElement.dataset.theme = "day";
    document.documentElement.style.colorScheme = "light";
  }
})();`;

export type ThemeMode = "day" | "night";

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "day" || value === "night";
}

export function applyTheme(mode: ThemeMode) {
  applyThemeToDocument(mode);
  try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* The selected theme still applies for this page when storage is unavailable. */ }
}

export function applyThemeToDocument(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === "day" ? "light" : "dark";
}
