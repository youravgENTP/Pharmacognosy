import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { StudySection } from "@/lib/db/schema";
import { stableDataCardJson, type ComparableDataCard } from "@/lib/data-card-content";

export const DATA_CARD_SYNC_LOCK_NAMESPACE = 48_271;
export const DATA_CARD_SYNC_LOCK_KEY = 1;

type LockTransaction = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export async function lockDataCardMutation(transaction: LockTransaction) {
  await transaction.execute(sql`select pg_advisory_xact_lock_shared(${DATA_CARD_SYNC_LOCK_NAMESPACE}, ${DATA_CARD_SYNC_LOCK_KEY})`);
}

export async function lockManualSynchronization(transaction: LockTransaction) {
  await transaction.execute(sql`select pg_advisory_xact_lock(${DATA_CARD_SYNC_LOCK_NAMESPACE}, ${DATA_CARD_SYNC_LOCK_KEY})`);
}

export type VerifiableDataCard = {
  koreanName: string;
  latinName: string | null;
  origin: string | null;
  origins: unknown[];
  scientificName: string | null;
  medicinalPart: string | null;
  familyId: string | null;
  importance: string;
  sections: StudySection[];
};

export function dataCardContentHash(value: VerifiableDataCard) {
  return createHash("sha256").update(stableDataCardJson(value as unknown as ComparableDataCard)).digest("hex");
}
