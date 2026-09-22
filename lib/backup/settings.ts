import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { BACKUP_POLICY_KEY, defaultBackupPolicy, isValidRestoreSafetyTicket, RESTORE_SAFETY_KEY, type BackupPolicy } from "@/lib/backup/policy";

export async function loadBackupPolicy(): Promise<BackupPolicy> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, BACKUP_POLICY_KEY)).limit(1);
  return { ...defaultBackupPolicy, ...(row?.value && typeof row.value === "object" ? row.value as Partial<BackupPolicy> : {}) };
}

export async function saveBackupPolicy(policy: BackupPolicy) {
  await db.insert(appSettings).values({ key: BACKUP_POLICY_KEY, value: policy, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: policy, updatedAt: new Date() } });
  return policy;
}

export async function createRestoreSafetyTicket(userId: string) {
  const token = crypto.randomUUID();
  const key = `${RESTORE_SAFETY_KEY}:${userId}`;
  await db.insert(appSettings).values({ key, value: { token, createdAt: new Date().toISOString(), consumed: false }, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: { token, createdAt: new Date().toISOString(), consumed: false }, updatedAt: new Date() } });
  return token;
}

export async function consumeRestoreSafetyTicket(userId: string, token: string) {
  const key = `${RESTORE_SAFETY_KEY}:${userId}`;
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, key)).for("update").limit(1);
    const value = row?.value as { token?: string; createdAt?: string; consumed?: boolean } | undefined;
    if (!isValidRestoreSafetyTicket(value, token)) return false;
    await tx.update(appSettings).set({ value: { ...value, consumed: true }, updatedAt: new Date() }).where(eq(appSettings.key, key));
    return true;
  });
}
