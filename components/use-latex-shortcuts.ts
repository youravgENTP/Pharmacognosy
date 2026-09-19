"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LATEX_SHORTCUTS, type LatexShortcut } from "@/lib/latex-shortcuts";

let cache: LatexShortcut[] | undefined;
let pending: Promise<LatexShortcut[]> | undefined;
function load() {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch("/api/settings/latex-shortcuts").then((response) => response.ok ? response.json() : DEFAULT_LATEX_SHORTCUTS).then((value) => cache = value).finally(() => { pending = undefined; });
  return pending;
}

export function useLatexShortcuts() {
  const [shortcuts, setShortcuts] = useState<LatexShortcut[]>(cache ?? DEFAULT_LATEX_SHORTCUTS);
  useEffect(() => {
    let active = true; const refresh = () => { cache = undefined; void load().then((value) => { if (active) setShortcuts(value); }); };
    void load().then((value) => { if (active) setShortcuts(value); });
    window.addEventListener("latex-shortcuts-updated", refresh);
    return () => { active = false; window.removeEventListener("latex-shortcuts-updated", refresh); };
  }, []);
  return shortcuts;
}
