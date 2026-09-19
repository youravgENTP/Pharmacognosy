import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { DEFAULT_LATEX_SHORTCUTS, type LatexShortcut } from "@/lib/latex-shortcuts";

export const LATEX_SHORTCUTS_KEY = "latex-shortcuts";

export async function getLatexShortcuts() {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, LATEX_SHORTCUTS_KEY)).limit(1);
  return Array.isArray(row?.value) ? row.value as LatexShortcut[] : DEFAULT_LATEX_SHORTCUTS;
}

export async function saveLatexShortcuts(shortcuts: LatexShortcut[]) {
  await db.insert(appSettings).values({ key: LATEX_SHORTCUTS_KEY, value: shortcuts, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: shortcuts, updatedAt: new Date() } });
  return shortcuts;
}
