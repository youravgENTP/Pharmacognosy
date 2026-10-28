import type { FieldInputMode, StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import type { SafeMaintenanceDrug, SafeMaintenancePlan } from "@/lib/safe-maintenance-plan";

export const FINAL_EXAM_CATEGORIES = new Set([
  "엽류", "피류", "화류", "목류", "수지류", "엑스류", "유액류", "은화식물류", "동물류",
  "유지류", "지방류", "식물정유류", "탄수화물류", "광물류",
]);

export type InitializableField = { id: string; name: string; inputMode: FieldInputMode; position: number; active: boolean };
export type InitializableDrug = {
  id: string;
  koreanName: string;
  categoryName: string | null;
  catalogIndex: number | null;
  referenceIndex: number | null;
  archived: boolean;
  sections: unknown;
  mnemonicItems?: unknown;
  mnemonicBlocks?: unknown;
};
export type EmptyFieldStatus = "initialize" | "already-initialized" | "excluded-content" | "manual-review" | "out-of-scope";
export type EmptyFieldClassification = { status: EmptyFieldStatus; reason: string; fieldsToAdd: InitializableField[] };

export function classifyEmptyDataCard(drug: InitializableDrug, fields: InitializableField[]): EmptyFieldClassification {
  const activeFields = fields.filter((field) => field.active).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ko"));
  if (drug.archived || drug.catalogIndex == null || drug.referenceIndex != null || !drug.categoryName || !FINAL_EXAM_CATEGORIES.has(drug.categoryName)) return { status: "out-of-scope", reason: "기말고사 활성 생약 범위가 아닙니다.", fieldsToAdd: [] };
  if (!activeFields.length) return { status: "manual-review", reason: "활성 Field Definition이 없습니다.", fieldsToAdd: [] };
  if (!Array.isArray(drug.sections)) return { status: "manual-review", reason: "sections 형식을 안전하게 판정할 수 없습니다.", fieldsToAdd: [] };

  const activeIds = new Set(activeFields.map((field) => field.id));
  const hasActiveSection = drug.sections.some((section) => isRecord(section) && typeof section.fieldDefinitionId === "string" && activeIds.has(section.fieldDefinitionId));
  const sectionState = inspectSections(drug.sections);
  const mnemonicState = mergeContentState(inspectItems(drug.mnemonicItems), inspectBlocks(drug.mnemonicBlocks));
  const contentState = mergeContentState(sectionState, mnemonicState);
  if (contentState === "content") return { status: "excluded-content", reason: "기존 텍스트, HTML, Block, 이미지 또는 Mnemonic 콘텐츠가 있습니다.", fieldsToAdd: [] };
  if (contentState === "uncertain") return { status: "manual-review", reason: "기존 콘텐츠가 비어 있는지 확실하게 판정할 수 없습니다.", fieldsToAdd: [] };
  if (hasActiveSection) return { status: "already-initialized", reason: "활성 필드와 연결된 빈 Section이 이미 있습니다.", fieldsToAdd: [] };
  return { status: "initialize", reason: "실질적인 필기 없이 활성 필드 Section이 없습니다.", fieldsToAdd: activeFields };
}

export function createEmptyFieldSections(fields: InitializableField[], createId = () => crypto.randomUUID()): StudySection[] {
  return fields.filter((field) => field.active).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ko")).map((field) => ({ id: createId(), fieldDefinitionId: field.id, title: field.name, items: [], blocks: [] }));
}

export function appendEmptyFieldSections(existing: StudySection[], fields: InitializableField[], createId = () => crypto.randomUUID()) {
  const present = new Set(existing.flatMap((section) => section.fieldDefinitionId ? [section.fieldDefinitionId] : []));
  return [...structuredClone(existing), ...createEmptyFieldSections(fields.filter((field) => !present.has(field.id)), createId)];
}

export type PlanInitializationDrug = InitializableDrug & { updatedAt?: Date };
export type PlanInitializationPreview = {
  canExecute: boolean;
  errors: string[];
  summary: { requested: number; initialize: number; excludedExisting: number; changedSinceBackup: number; conflicts: number };
  initialize: { id: string; koreanName: string; categoryName: string; fields: string[] }[];
  excluded: { id: string; koreanName: string; reason: string }[];
  conflicts: { id: string; koreanName: string; reason: string }[];
};

export function buildPlanInitializationPreview(plan: SafeMaintenancePlan, liveDrugs: PlanInitializationDrug[], liveFields: InitializableField[]): PlanInitializationPreview {
  const errors: string[] = [];
  const conflicts: PlanInitializationPreview["conflicts"] = [];
  const excluded: PlanInitializationPreview["excluded"] = [];
  const initialize: PlanInitializationPreview["initialize"] = [];
  const fieldById = new Map(liveFields.map((field) => [field.id, field]));
  const selectedFields: InitializableField[] = [];
  for (const expected of plan.defaultFields) {
    const live = fieldById.get(expected.id);
    if (!live || !live.active || live.name !== expected.name || live.inputMode !== expected.inputMode || live.position !== expected.position) errors.push(`Field Definition '${expected.name}'이 계획과 현재 DB에서 다릅니다.`);
    else selectedFields.push(live);
  }
  const liveById = new Map(liveDrugs.map((drug) => [drug.id, drug]));
  let changedSinceBackup = 0;
  for (const expected of plan.drugs) {
    const live = liveById.get(expected.drugId);
    const conflict = planDrugConflict(expected, live);
    if (conflict) { conflicts.push({ id: expected.drugId, koreanName: expected.koreanName, reason: conflict }); continue; }
    if (!Array.isArray(live!.sections)) { conflicts.push({ id: expected.drugId, koreanName: expected.koreanName, reason: "sections 형식을 안전하게 판정할 수 없습니다." }); continue; }
    const sectionCountChanged = live!.sections.length !== expected.sectionsAtBackup;
    if (sectionCountChanged) changedSinceBackup++;
    if (!expected.initializeFieldsOnlyIfEmpty) {
      excluded.push({ id: expected.drugId, koreanName: expected.koreanName, reason: sectionCountChanged ? `백업 당시 ${expected.sectionsAtBackup}개였던 Section이 현재 ${live!.sections.length}개이며 기존 Section은 덮어쓰지 않습니다.` : "백업 당시 기존 Section이 있어 초기화 대상이 아닙니다." });
      continue;
    }
    if (live!.sections.length !== 0) {
      excluded.push({ id: expected.drugId, koreanName: expected.koreanName, reason: `백업 이후 Section이 ${live!.sections.length}개가 되어 덮어쓰지 않습니다.` });
      continue;
    }
    initialize.push({ id: expected.drugId, koreanName: expected.koreanName, categoryName: expected.category, fields: selectedFields.map((field) => field.name) });
  }
  errors.push(...conflicts.map((item) => `${item.koreanName}: ${item.reason}`));
  return { canExecute: errors.length === 0 && selectedFields.length === 7, errors, summary: { requested: plan.drugs.length, initialize: initialize.length, excludedExisting: excluded.length, changedSinceBackup, conflicts: conflicts.length }, initialize, excluded, conflicts };
}

function planDrugConflict(expected: SafeMaintenanceDrug, live: PlanInitializationDrug | undefined) {
  if (!live) return "DB에서 UUID가 일치하는 생약을 찾을 수 없습니다.";
  if (live.koreanName !== expected.koreanName) return `UUID의 생약명이 계획의 '${expected.koreanName}'과 다릅니다.`;
  if (live.categoryName !== expected.category) return `현재 분류 '${live.categoryName ?? "없음"}'가 계획의 '${expected.category}'와 다릅니다.`;
  if (live.archived) return "Archive 상태라 초기화할 수 없습니다.";
  if (live.referenceIndex != null || live.catalogIndex == null) return "활성 catalogIndex 생약이 아닙니다.";
  return null;
}

type ContentState = "empty" | "content" | "uncertain";
function mergeContentState(...states: ContentState[]): ContentState { return states.includes("content") ? "content" : states.includes("uncertain") ? "uncertain" : "empty"; }
function inspectSections(value: unknown[]): ContentState {
  let state: ContentState = "empty";
  for (const section of value) {
    if (!isRecord(section) || !Array.isArray(section.items) || section.blocks !== undefined && !Array.isArray(section.blocks)) return "uncertain";
    state = mergeContentState(state, inspectItems(section.items), inspectBlocks(section.blocks));
  }
  return state;
}
function inspectItems(value: unknown): ContentState {
  if (value === undefined) return "empty";
  if (!Array.isArray(value)) return "uncertain";
  let state: ContentState = "empty";
  for (const item of value) {
    if (!isRecord(item) || typeof item.text !== "string" || item.html !== undefined && typeof item.html !== "string" || item.children !== undefined && !Array.isArray(item.children)) return "uncertain";
    if (item.text.trim() || typeof item.html === "string" && item.html.trim()) return "content";
    if (item.bold === true || item.italic === true || item.highlight === true) state = "uncertain";
    state = mergeContentState(state, inspectItems(item.children));
  }
  return state;
}
function inspectBlocks(value: unknown): ContentState {
  if (value === undefined) return "empty";
  if (!Array.isArray(value)) return "uncertain";
  let state: ContentState = "empty";
  for (const block of value) {
    if (!isRecord(block) || typeof block.type !== "string") return "uncertain";
    if (block.type === "image") return "content";
    if (block.type === "items") state = mergeContentState(state, inspectItems(block.items));
    else if (block.type === "text") {
      if (!isRecord(block.content) || typeof block.content.text !== "string" || block.content.html !== undefined && typeof block.content.html !== "string") return "uncertain";
      if (block.content.text.trim() || typeof block.content.html === "string" && block.content.html.trim()) return "content";
    } else return "uncertain";
  }
  return state;
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

export function hasMeaningfulMnemonic(items: StudyItem[], blocks: StudyBlock[]) {
  return mergeContentState(inspectItems(items), inspectBlocks(blocks)) !== "empty";
}
