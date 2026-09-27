import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, userDrugMnemonics, userMnemonicPreferences } from "@/lib/db/schema";
import { isMissingPreferenceTable } from "@/lib/export/mnemonic-compat";

export type MnemonicExportMode = "preferred" | "mine" | "user" | "none" | "all";
let preferenceTableAvailable: boolean | undefined;

export async function getMnemonicVersions(drugId: string) {
  return db.select({ userId: userDrugMnemonics.userId, userName: user.name, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks, updatedAt: userDrugMnemonics.updatedAt }).from(userDrugMnemonics).innerJoin(user, eq(user.id, userDrugMnemonics.userId)).where(eq(userDrugMnemonics.drugId, drugId)).orderBy(desc(userDrugMnemonics.updatedAt));
}

export async function selectMnemonicVersions(drugId: string, viewingUserId: string, mode: MnemonicExportMode, selectedUserId?: string) {
  if (mode === "none") return [];
  const versions = await getMnemonicVersions(drugId);
  if (mode === "all") return versions;
  if (mode === "mine") return versions.filter((version) => version.userId === viewingUserId).slice(0, 1);
  if (mode === "user") return versions.filter((version) => version.userId === selectedUserId).slice(0, 1);
  let preference: { preferredMnemonicUserId: string | null } | undefined;
  try {
    if (preferenceTableAvailable !== false) {
      [preference] = await db.select({ preferredMnemonicUserId: userMnemonicPreferences.preferredMnemonicUserId }).from(userMnemonicPreferences).where(and(eq(userMnemonicPreferences.userId, viewingUserId), eq(userMnemonicPreferences.drugId, drugId))).limit(1);
      preferenceTableAvailable = true;
    }
  }
  catch (error) {
    if (!isMissingPreferenceTable(error)) throw error;
    preferenceTableAvailable = false;
    console.warn("[DataCardExport] mnemonic preference table unavailable; using deterministic fallback", { drugId, message: error instanceof Error ? error.message : String(error) });
  }
  return [versions.find((version) => version.userId === preference?.preferredMnemonicUserId) ?? versions.find((version) => version.userId === viewingUserId) ?? versions[0]].filter(Boolean);
}
