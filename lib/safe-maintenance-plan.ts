import { z } from "zod";

export const MAINTENANCE_DEFAULT_FIELD_NAMES = [
  "성분", "약리", "응용", "처방·생약유래 의약품", "주의·부작용·독성", "기타", "암기법",
] as const;

export const MAINTENANCE_EXCLUDED_FIELD_NAMES = ["확인시험", "규격시험·정량·기준", "교수니 밑줄"] as const;

const planFieldSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  inputMode: z.enum(["hierarchy4", "hierarchy3", "text"]),
  position: z.number().int(),
}).strict();

const planDrugSchema = z.object({
  drugId: z.string().uuid(),
  koreanName: z.string().min(1),
  category: z.string().min(1),
  expectedCatalogIndex: z.number().int().positive(),
  targetCatalogIndex: z.number().int().min(1).max(153),
  sectionsAtBackup: z.number().int().nonnegative(),
  initializeFieldsOnlyIfEmpty: z.boolean(),
}).strict();

export const safeMaintenancePlanSchema = z.object({
  format: z.literal("herboverflow.safe-maintenance-plan"),
  version: z.literal(1),
  sourceBackup: z.string().min(1),
  sourceWorkbook: z.string().min(1),
  notForNormalImport: z.literal(true),
  databaseOperationsRequireLivePreviewAndBackup: z.literal(true),
  excludeFields: z.array(z.string()).length(3),
  defaultFields: z.array(planFieldSchema).length(7),
  rules: z.object({ reindex: z.string(), initialize: z.string(), archive: z.string(), preview: z.string() }).strict(),
  statsAtBackup: z.object({ targetCount: z.literal(153), indexChanges: z.number().int().nonnegative(), emptySections: z.number().int().nonnegative(), existingSections: z.number().int().nonnegative() }).strict(),
  drugs: z.array(planDrugSchema).length(153),
}).strict().superRefine((plan, context) => {
  if (!sourceBackupTimestamp(plan.sourceBackup)) context.addIssue({ code: "custom", path: ["sourceBackup"], message: "Backup 파일명에서 생성 시각을 확인할 수 없습니다." });
  const ids = new Set(plan.drugs.map((drug) => drug.drugId));
  const targets = new Set(plan.drugs.map((drug) => drug.targetCatalogIndex));
  if (ids.size !== plan.drugs.length) context.addIssue({ code: "custom", path: ["drugs"], message: "drugId가 중복되어 있습니다." });
  if (targets.size !== 153 || [...targets].some((value) => value < 1 || value > 153)) context.addIssue({ code: "custom", path: ["drugs"], message: "targetCatalogIndex는 1~153을 중복 없이 포함해야 합니다." });
  if (plan.statsAtBackup.emptySections + plan.statsAtBackup.existingSections !== 153) context.addIssue({ code: "custom", path: ["statsAtBackup"], message: "백업 Section 통계 합계가 153이 아닙니다." });
  if (plan.drugs.filter((drug) => drug.sectionsAtBackup === 0).length !== plan.statsAtBackup.emptySections) context.addIssue({ code: "custom", path: ["statsAtBackup", "emptySections"], message: "drugs의 빈 Section 수와 통계가 다릅니다." });
  if (plan.drugs.filter((drug) => drug.expectedCatalogIndex !== drug.targetCatalogIndex).length !== plan.statsAtBackup.indexChanges) context.addIssue({ code: "custom", path: ["statsAtBackup", "indexChanges"], message: "번호 변경 수와 통계가 다릅니다." });
  if (plan.drugs.some((drug) => drug.initializeFieldsOnlyIfEmpty !== (drug.sectionsAtBackup === 0))) context.addIssue({ code: "custom", path: ["drugs"], message: "initializeFieldsOnlyIfEmpty와 백업 당시 Section 수가 일치하지 않습니다." });
  if (JSON.stringify(plan.defaultFields.map((field) => field.name)) !== JSON.stringify(MAINTENANCE_DEFAULT_FIELD_NAMES)) context.addIssue({ code: "custom", path: ["defaultFields"], message: "기본 필드 7개 또는 순서가 안전 계획과 다릅니다." });
  if (JSON.stringify(plan.excludeFields) !== JSON.stringify(MAINTENANCE_EXCLUDED_FIELD_NAMES)) context.addIssue({ code: "custom", path: ["excludeFields"], message: "자동 생성 제외 필드가 안전 계획과 다릅니다." });
});

export type SafeMaintenancePlan = z.infer<typeof safeMaintenancePlanSchema>;
export type SafeMaintenanceDrug = SafeMaintenancePlan["drugs"][number];

export function sourceBackupTimestamp(filename: string) {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
