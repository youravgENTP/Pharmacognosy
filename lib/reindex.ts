import { z } from "zod";

export const reindexImportSchema = z.object({
  schema: z.literal("pharmacognosy.import"),
  version: z.literal(1),
  drugs: z.array(z.object({
    koreanName: z.string().min(1),
    catalogIndex: z.number().int().positive(),
  }).passthrough()).min(1),
}).passthrough();

export type ReindexInput = z.infer<typeof reindexImportSchema>["drugs"][number];
export type ReindexDrug = {
  id: string;
  koreanName: string;
  catalogIndex: number | null;
  referenceIndex: number | null;
  archived: boolean;
};
export type ReindexPlanItem = {
  id: string | null;
  koreanName: string;
  currentIndex: number | null;
  targetIndex: number;
  changed: boolean;
  errors: string[];
};
export type ReindexPlan = {
  canExecute: boolean;
  summary: { requested: number; changed: number; unchanged: number; errors: number };
  items: ReindexPlanItem[];
  errors: string[];
};

/** Builds an index-only plan. Name matching is deliberately byte-for-byte exact. */
export function buildReindexPlan(input: ReindexInput[], existing: ReindexDrug[]): ReindexPlan {
  const byName = new Map(existing.map((drug) => [drug.koreanName, drug]));
  const inputNameCounts = counts(input.map((drug) => drug.koreanName));
  const targetCounts = counts(input.map((drug) => drug.catalogIndex));
  const requestedNames = new Set(input.map((drug) => drug.koreanName));
  const errors: string[] = [];
  const items = input.map((request): ReindexPlanItem => {
    const drug = byName.get(request.koreanName);
    const itemErrors: string[] = [];
    if ((inputNameCounts.get(request.koreanName) ?? 0) > 1) itemErrors.push("JSON에 같은 koreanName이 중복되어 있습니다.");
    if ((targetCounts.get(request.catalogIndex) ?? 0) > 1) itemErrors.push(`목표 인덱스 ${request.catalogIndex}이(가) 중복되어 있습니다.`);
    if (!drug) itemErrors.push("DB에서 정확히 일치하는 koreanName을 찾을 수 없습니다.");
    else {
      if (drug.archived) itemErrors.push("Archive 상태의 생약은 Reindex할 수 없습니다.");
      if (drug.referenceIndex != null) itemErrors.push("R 인덱스 생약은 Reindex할 수 없습니다.");
      if (drug.catalogIndex == null) itemErrors.push("활성 catalogIndex가 없는 생약은 Reindex할 수 없습니다.");
    }
    return { id: drug?.id ?? null, koreanName: request.koreanName, currentIndex: drug?.catalogIndex ?? null, targetIndex: request.catalogIndex, changed: Boolean(drug && drug.catalogIndex !== request.catalogIndex), errors: itemErrors };
  });

  for (const occupied of existing) {
    if (occupied.catalogIndex == null || requestedNames.has(occupied.koreanName)) continue;
    const contenders = items.filter((item) => item.targetIndex === occupied.catalogIndex);
    for (const item of contenders) item.errors.push(`목표 인덱스 ${item.targetIndex}은(는) 변경 대상이 아닌 활성 생약 ${occupied.koreanName}이(가) 사용 중입니다.`);
  }
  for (const item of items) for (const message of item.errors) errors.push(`${item.koreanName}: ${message}`);
  const changed = items.filter((item) => item.changed).length;
  return { canExecute: errors.length === 0, summary: { requested: items.length, changed, unchanged: items.length - changed, errors: errors.length }, items, errors };
}

export function applyReindexPlanSnapshot<T extends ReindexDrug>(drugs: T[], plan: ReindexPlan): T[] {
  if (!plan.canExecute) throw new Error("Cannot apply an invalid Reindex plan");
  const targets = new Map(plan.items.flatMap((item) => item.id && item.changed ? [[item.id, item.targetIndex] as const] : []));
  return drugs.map((drug) => targets.has(drug.id) ? { ...drug, catalogIndex: targets.get(drug.id)! } : structuredClone(drug));
}

function counts<T>(values: T[]) {
  const result = new Map<T, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}
