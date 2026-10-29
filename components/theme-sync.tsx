"use client";

import { useEffect } from "react";
import { applyThemeToDocument, isThemeMode, THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeSync() {
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      applyThemeToDocument(isThemeMode(event.newValue) ? event.newValue : "day");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return null;
}
