import type { FieldInputMode, ImportanceLevel, OriginPlant, StudyItem, StudySection } from "@/lib/db/schema";
import type { ImportDrug, ImportItem, PharmacognosyImportV1 } from "@/lib/import-schema";
import { isReservedImportSection, normalizeFieldAlias, normalizeImportPayload, normalizeKey, type ImportCorrection } from "@/lib/import-normalization";

export type ImportFieldDefinition = { id: string; name: string; inputMode: FieldInputMode; position: number; active: boolean };
export type ImportExistingDrug = {
  id: string; koreanName: string; latinName: string | null; origin: string | null; origins: OriginPlant[]; scientificName: string | null;
  medicinalPart: string | null; categoryId: string | null; familyId: string | null; importance: ImportanceLevel; sections: StudySection[];
};
export type ImportFamily = { id: string; koreanName: string; scientificName: string };
export type ImportIssue = { code: string; message: string; field?: string; sourceDepth?: number; destinationMode?: FieldInputMode };
export type ResolvedImportSection = { fieldDefinitionId: string; title: string; inputMode: FieldInputMode; position: number; items: ImportItem[]; sourceHeadings: string[] };
export type PreparedRelationship = { targetKoreanName: string; type: string; notes?: string | null; resolvable: boolean; source: "payload" | "database" | "missing" };
export type PreparedImportDrug = {
  input: ImportDrug;
  existing?: ImportExistingDrug;
  sections: ResolvedImportSection[];
  relationships: PreparedRelationship[];
  corrections: ImportCorrection[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  preview: {
    fieldsAdded: string[]; fieldsUpdated: string[]; fieldsPreserved: string[];
    familyAction: string; relationshipAction: string; mnemonicAction: string; identityAction: string; richTextCount: number;
  };
};
export type PreparedImport = { payload: PharmacognosyImportV1; drugs: PreparedImportDrug[]; canCommit: boolean };

export function prepareImport(payload: PharmacognosyImportV1, context: {
  fields: ImportFieldDefinition[];
  existingDrugs: ImportExistingDrug[];
  families?: ImportFamily[];
  mnemonicDrugIds?: Set<string>;
}) : PreparedImport {
  const normalized = normalizeImportPayload(payload);
  const activeFields = context.fields.filter((field) => field.active);
  const fieldByName = new Map(activeFields.map((field) => [normalizeKey(field.name), field]));
  const fallback = fieldByName.get(normalizeKey("기타"));
  const mnemonicField = fieldByName.get(normalizeKey("암기법"));
  const existingByName = new Map(context.existingDrugs.map((drug) => [normalizeKey(drug.koreanName), drug]));
  const payloadNames = new Set(normalized.payload.drugs.map((drug) => normalizeKey(drug.koreanName)));
  const knownNames = new Set([...existingByName.keys(), ...payloadNames]);
  const familyByScientificName = new Map((context.families ?? []).map((family) => [normalizeKey(family.scientificName), family]));

  const drugs = normalized.payload.drugs.map((input, index): PreparedImportDrug => {
    const errors: ImportIssue[] = normalized.issues[index].map((issue) => ({ code: issue.code, field: issue.path, message: issue.message }));
    const warnings: ImportIssue[] = [];
    const sectionGroups = new Map<string, ResolvedImportSection>();
    for (const section of input.sections ?? []) {
      const sourceHeading = (section.field ?? section.title)!;
      const canonical = normalizeFieldAlias(sourceHeading);
      if (isReservedImportSection(canonical)) {
        errors.push({ code: "reserved-section", field: sourceHeading, message: `${sourceHeading}은(는) 일반 섹션이 아니라 전용 Import 속성으로 입력해야 합니다.` });
        continue;
      }
      let field = fieldByName.get(normalizeKey(canonical));
      let items = section.items;
      if (!field) {
        if (!fallback) {
          errors.push({ code: "missing-fallback-field", field: sourceHeading, message: `알 수 없는 필드 “${sourceHeading}”을 보존할 기타 필드가 없습니다.` });
          continue;
        }
        field = fallback;
        items = [{ text: section.title ?? section.field ?? sourceHeading, children: section.items }];
        warnings.push({ code: "fallback-field", field: sourceHeading, message: `알 수 없는 필드 “${sourceHeading}”은(는) 원래 제목을 유지해 기타로 가져옵니다.` });
      }
      const key = field.id;
      const current = sectionGroups.get(key);
      if (current) { current.items.push(...items); current.sourceHeadings.push(sourceHeading); }
      else sectionGroups.set(key, { fieldDefinitionId: field.id, title: field.name, inputMode: field.inputMode, position: field.position, items: structuredClone(items), sourceHeadings: [sourceHeading] });
    }
    const sections = [...sectionGroups.values()].sort((left, right) => left.position - right.position);
    for (const section of sections) errors.push(...validateHierarchy(section.title, section.items, section.inputMode));
    if (input.mnemonic) {
      if (!mnemonicField) errors.push({ code: "missing-mnemonic-field", field: "암기법", message: "활성 암기법 필드 정의가 없습니다." });
      else errors.push(...validateHierarchy("암기법", input.mnemonic.items, mnemonicField.inputMode));
    }
    const existing = existingByName.get(normalizeKey(input.koreanName));
    const incomingIds = new Set(sections.map((section) => section.fieldDefinitionId));
    const incomingNames = new Set(sections.map((section) => normalizeKey(section.title)));
    const existingSections = (existing?.sections ?? []).filter((section) => resolveExistingField(section, activeFields)?.name !== "암기법");
    const fieldsAdded = sections.filter((section) => !existingSections.some((existingSection) => sameSection(existingSection, section, activeFields))).map((section) => section.title);
    const fieldsUpdated = sections.filter((section) => existingSections.some((existingSection) => sameSection(existingSection, section, activeFields))).map((section) => section.title);
    const fieldsPreserved = existingSections.filter((section) => {
      const resolved = resolveExistingField(section, activeFields);
      return !incomingIds.has(resolved?.id ?? "") && !incomingNames.has(normalizeKey(resolved?.name ?? section.title));
    }).map((section) => resolveExistingField(section, activeFields)?.name ?? section.title);
    const relationships = (input.relationships ?? []).map((relationship): PreparedRelationship => {
      const key = normalizeKey(relationship.targetKoreanName);
      const source = payloadNames.has(key) ? "payload" : existingByName.has(key) ? "database" : "missing";
      if (key === normalizeKey(input.koreanName)) errors.push({ code: "self-relationship", message: `${input.koreanName}은(는) 자기 자신과 관계를 만들 수 없습니다.` });
      if (!knownNames.has(key)) warnings.push({ code: "unresolved-relationship", message: `관계 대상 “${relationship.targetKoreanName}”을 찾지 못해 이 관계는 건너뜁니다.` });
      return { ...relationship, resolvable: knownNames.has(key), source };
    });
    const family = input.family ? familyByScientificName.get(normalizeKey(input.family.scientificName)) : undefined;
    const familyAction = input.family ? (family ? `기존 과 사용 · ${family.scientificName}` : `새 과 생성 · ${input.family.scientificName}`) : Object.hasOwn(input, "family") ? "과 연결 제거" : existing?.familyId ? "기존 과 유지" : "변경 없음";
    const mnemonicAction = input.mnemonic ? (existing && context.mnemonicDrugIds?.has(existing.id) ? "현재 사용자 암기법 업데이트" : "현재 사용자 암기법 추가") : "변경 없음";
    const identityAction = input.identityTerms ? `${input.identityTerms.length}개 식별 용어 교체` : "변경 없음";
    return {
      input, existing, sections, relationships, corrections: normalized.corrections[index], errors, warnings,
      preview: { fieldsAdded, fieldsUpdated, fieldsPreserved, familyAction, relationshipAction: `${relationships.filter((item) => item.resolvable).length}개 적용${relationships.some((item) => !item.resolvable) ? ` · ${relationships.filter((item) => !item.resolvable).length}개 건너뜀` : ""}`, mnemonicAction, identityAction, richTextCount: sections.reduce((sum, section) => sum + countRichItems(section.items), 0) + countRichItems(input.mnemonic?.items ?? []) },
    };
  });
  return { payload: normalized.payload, drugs, canCommit: drugs.every((drug) => !drug.errors.length) };
}

export function validateHierarchy(field: string, items: ImportItem[], mode: FieldInputMode): ImportIssue[] {
  const sourceDepth = hierarchyDepth(items);
  if (mode === "text" && (sourceDepth > 1 || items.length > 1)) return [{ code: "text-hierarchy", field, sourceDepth, destinationMode: mode, message: `${field}: text 필드는 단일 텍스트 항목만 지원합니다 (source depth ${sourceDepth}).` }];
  const maximum = mode === "hierarchy4" ? 4 : mode === "hierarchy3" ? 3 : 1;
  return sourceDepth > maximum ? [{ code: "hierarchy-overflow", field, sourceDepth, destinationMode: mode, message: `${field}: ${mode}의 최대 ${maximum}단계를 초과했습니다 (source depth ${sourceDepth}).` }] : [];
}

export function hierarchyDepth(items: ImportItem[]): number {
  return items.reduce((maximum, item) => Math.max(maximum, 1 + hierarchyDepth(item.children ?? [])), 0);
}

export function importItemsWithIds(items: ImportItem[], id = () => crypto.randomUUID()): StudyItem[] {
  return items.map((item) => ({
    id: id(),
    text: item.text,
    ...(item.html !== undefined ? { html: item.html } : {}),
    ...(item.bold !== undefined ? { bold: item.bold } : {}),
    ...(item.italic !== undefined ? { italic: item.italic } : {}),
    ...(item.highlight !== undefined ? { highlight: item.highlight } : {}),
    ...(item.children ? { children: importItemsWithIds(item.children, id) } : {}),
  }));
}

function countRichItems(items: ImportItem[]): number {
  return items.reduce((sum, item) => sum + (item.html === undefined ? 0 : 1) + countRichItems(item.children ?? []), 0);
}

export function mergeImportedSections(existing: StudySection[], incoming: ResolvedImportSection[], fields: ImportFieldDefinition[], includeMnemonic = false, id = () => crypto.randomUUID()) {
  const mnemonicField = fields.find((field) => field.active && normalizeKey(field.name) === normalizeKey("암기법"));
  const next = [...existing];
  for (const section of incoming) {
    const index = next.findIndex((candidate) => candidate.fieldDefinitionId === section.fieldDefinitionId || normalizeKey(normalizeFieldAlias(candidate.title)) === normalizeKey(section.title));
    const converted: StudySection = { id: index >= 0 ? next[index].id : id(), fieldDefinitionId: section.fieldDefinitionId, title: section.title, items: importItemsWithIds(section.items, id) };
    if (index >= 0) next[index] = converted; else next.push(converted);
  }
  if (includeMnemonic && mnemonicField && !next.some((section) => section.fieldDefinitionId === mnemonicField.id || normalizeKey(section.title) === normalizeKey("암기법"))) next.push({ id: id(), fieldDefinitionId: mnemonicField.id, title: mnemonicField.name, items: [] });
  const position = new Map(fields.map((field) => [field.id, field.position]));
  return next.sort((left, right) => (position.get(left.fieldDefinitionId ?? "") ?? 10_000) - (position.get(right.fieldDefinitionId ?? "") ?? 10_000));
}

export function scalarMergePatch(input: ImportDrug, resolved: { categoryId: string; familyId?: string | null }) {
  const patch: Record<string, unknown> = { categoryId: resolved.categoryId };
  for (const key of ["latinName", "origin", "origins", "scientificName", "medicinalPart", "importance"] as const) if (Object.hasOwn(input, key)) patch[key] = input[key];
  if (Object.hasOwn(input, "family")) patch.familyId = resolved.familyId ?? null;
  return patch;
}

function resolveExistingField(section: StudySection, fields: ImportFieldDefinition[]) {
  return fields.find((field) => field.id === section.fieldDefinitionId) ?? fields.find((field) => normalizeKey(field.name) === normalizeKey(normalizeFieldAlias(section.title)));
}

function sameSection(existing: StudySection, incoming: ResolvedImportSection, fields: ImportFieldDefinition[]) {
  const resolved = resolveExistingField(existing, fields);
  return resolved?.id === incoming.fieldDefinitionId || normalizeKey(resolved?.name ?? existing.title) === normalizeKey(incoming.title);
}
