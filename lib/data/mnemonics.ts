import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, userDrugMnemonics, userMnemonicPreferences } from "@/lib/db/schema";
import { isMissingPreferenceTable } from "@/lib/export/mnemonic-compat";
import { resolveCanonicalMnemonic } from "@/lib/mnemonic-preferences";

export type MnemonicExportMode = "preferred" | "mine" | "user" | "none" | "all";
let preferenceTableAvailable: boolean | undefined;

export async function getMnemonicVersions(drugId: string) {
  return db.select({ userId: userDrugMnemonics.userId, userName: user.name, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks, updatedAt: userDrugMnemonics.updatedAt }).from(userDrugMnemonics).innerJoin(user, eq(user.id, userDrugMnemonics.userId)).where(eq(userDrugMnemonics.drugId, drugId)).orderBy(asc(user.name), asc(userDrugMnemonics.userId));
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
  const resolved = resolveCanonicalMnemonic(viewingUserId, versions, preference?.preferredMnemonicUserId);
  return resolved.mnemonic ? [resolved.mnemonic] : [];
}

export async function selectMnemonicVersionsForDrugs(drugIds: string[], viewingUserId: string, mode: MnemonicExportMode, selectedUserId?: string) {
  const result = new Map<string, Awaited<ReturnType<typeof getMnemonicVersions>>>();
  for (const drugId of drugIds) result.set(drugId, []);
  if (!drugIds.length || mode === "none") return result;

  const versions = await db.select({ drugId: userDrugMnemonics.drugId, userId: userDrugMnemonics.userId, userName: user.name, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks, updatedAt: userDrugMnemonics.updatedAt })
    .from(userDrugMnemonics)
    .innerJoin(user, eq(user.id, userDrugMnemonics.userId))
    .where(inArray(userDrugMnemonics.drugId, drugIds))
    .orderBy(asc(userDrugMnemonics.drugId), asc(user.name), asc(userDrugMnemonics.userId));
  const grouped = new Map<string, typeof versions>();
  for (const version of versions) grouped.set(version.drugId, [...(grouped.get(version.drugId) ?? []), version]);

  let preferences = new Map<string, string | null>();
  if (mode === "preferred") try {
    if (preferenceTableAvailable !== false) {
      const rows = await db.select({ drugId: userMnemonicPreferences.drugId, preferredMnemonicUserId: userMnemonicPreferences.preferredMnemonicUserId })
        .from(userMnemonicPreferences)
        .where(and(eq(userMnemonicPreferences.userId, viewingUserId), inArray(userMnemonicPreferences.drugId, drugIds)));
      preferences = new Map(rows.map((row) => [row.drugId, row.preferredMnemonicUserId]));
      preferenceTableAvailable = true;
    }
  } catch (error) {
    if (!isMissingPreferenceTable(error)) throw error;
    preferenceTableAvailable = false;
    console.warn("[DataCardExport] mnemonic preference table unavailable; using deterministic fallback", { message: error instanceof Error ? error.message : String(error) });
  }

  for (const drugId of drugIds) {
    const available = grouped.get(drugId) ?? [];
    if (mode === "all") result.set(drugId, available);
    else if (mode === "mine") result.set(drugId, available.filter((version) => version.userId === viewingUserId).slice(0, 1));
    else if (mode === "user") result.set(drugId, available.filter((version) => version.userId === selectedUserId).slice(0, 1));
    else {
      const resolved = resolveCanonicalMnemonic(viewingUserId, available, preferences.get(drugId));
      result.set(drugId, resolved.mnemonic ? [resolved.mnemonic] : []);
    }
  }
  return result;
}
