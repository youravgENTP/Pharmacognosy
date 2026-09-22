export const THEME_STORAGE_KEY = "herb-overflow-theme";

export const THEME_INITIALIZER = `(() => {
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme = saved === "day" || saved === "night" ? saved : "night";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "day" ? "light" : "dark";
  } catch {
    document.documentElement.dataset.theme = "night";
    document.documentElement.style.colorScheme = "dark";
  }
})();`;

export type ThemeMode = "day" | "night";

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "day" || value === "night";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === "day" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}
