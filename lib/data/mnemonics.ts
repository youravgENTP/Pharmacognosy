import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, userDrugMnemonics, userMnemonicPreferences } from "@/lib/db/schema";

export type MnemonicExportMode = "preferred" | "mine" | "user" | "none" | "all";

export async function getMnemonicVersions(drugId: string) {
  return db.select({ userId: userDrugMnemonics.userId, userName: user.name, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks, updatedAt: userDrugMnemonics.updatedAt }).from(userDrugMnemonics).innerJoin(user, eq(user.id, userDrugMnemonics.userId)).where(eq(userDrugMnemonics.drugId, drugId)).orderBy(desc(userDrugMnemonics.updatedAt));
}

export async function selectMnemonicVersions(drugId: string, viewingUserId: string, mode: MnemonicExportMode, selectedUserId?: string) {
  if (mode === "none") return [];
  const versions = await getMnemonicVersions(drugId);
  if (mode === "all") return versions;
  if (mode === "mine") return versions.filter((version) => version.userId === viewingUserId).slice(0, 1);
  if (mode === "user") return versions.filter((version) => version.userId === selectedUserId).slice(0, 1);
  const [preference] = await db.select({ preferredMnemonicUserId: userMnemonicPreferences.preferredMnemonicUserId }).from(userMnemonicPreferences).where(and(eq(userMnemonicPreferences.userId, viewingUserId), eq(userMnemonicPreferences.drugId, drugId))).limit(1);
  return [versions.find((version) => version.userId === preference?.preferredMnemonicUserId) ?? versions.find((version) => version.userId === viewingUserId) ?? versions[0]].filter(Boolean);
}
