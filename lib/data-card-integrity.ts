import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { StudySection } from "@/lib/db/schema";

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
  return createHash("sha256").update(stableJson({
    koreanName: value.koreanName,
    latinName: value.latinName,
    origin: value.origin,
    origins: value.origins,
    scientificName: value.scientificName,
    medicinalPart: value.medicinalPart,
    familyId: value.familyId,
    importance: value.importance,
    sections: value.sections,
  })).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
