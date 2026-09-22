import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { parseBackupArchive, sha256 } from "@/lib/backup/archive";
import { applySelectedDrugFields, backupDrugSchema, referencedMediaIds, referencedTaxonIds, restoreFieldOptions, rewriteSectionMedia, rewriteSectionTaxa, type RestoreSelection } from "@/lib/backup/restore";
import { readMediaAssetBytes } from "@/lib/media/read";

export async function previewRestoreArchive(buffer: Buffer) {
  const archive = await parseBackupArchive(buffer);
  const drugs = archive.tables["crude-drugs"].map((row) => backupDrugSchema.parse(row));
  const currentRows = await db.select({ id: schema.crudeDrugs.id, koreanName: schema.crudeDrugs.koreanName, catalogIndex: schema.crudeDrugs.catalogIndex, referenceIndex: schema.crudeDrugs.referenceIndex }).from(schema.crudeDrugs);
  const current = new Set(currentRows.map((row) => row.id));
  const currentFields = new Map((await db.select().from(schema.fieldDefinitions)).map((row) => [row.id, row]));
  const currentTaxa = new Map((await db.select().from(schema.constituentTaxa)).map((row) => [row.id, row]));
  const backupFields = new Map(archive.tables["field-definitions"].map((row) => { const value = record(row); return [string(value.id), value] as const; }));
  const backupTaxa = new Map(archive.tables["constituent-taxa"].map((row) => { const value = record(row); return [string(value.id), value] as const; }));
  const backupRelationships = archive.tables["crude-drug-relationships"].map(record);
  const anchors = await db.select({ ownerId: schema.conceptAnchors.ownerId, targetRef: schema.conceptAnchors.targetRef }).from(schema.conceptAnchors).where(eq(schema.conceptAnchors.ownerType, "drug"));
  const anchorCounts = new Map<string, number>();
  for (const anchor of anchors) anchorCounts.set(anchor.ownerId, (anchorCounts.get(anchor.ownerId) ?? 0) + 1);
  return {
    manifest: archive.manifest,
    drugs: drugs.map((drug) => {
      const warnings: string[] = [];
      if (anchorCounts.get(drug.id)) warnings.push(`현재 Data Card에 개념 앵커 ${anchorCounts.get(drug.id)}개가 있습니다. 복원 후 검토가 필요합니다.`);
      const duplicate = currentRows.find((row) => row.id !== drug.id && (row.koreanName === drug.koreanName || (drug.catalogIndex != null && row.catalogIndex === drug.catalogIndex) || (drug.referenceIndex != null && row.referenceIndex === drug.referenceIndex)));
      if (duplicate) warnings.push(`기본 정보가 현재 ${duplicate.koreanName} Data Card의 고유 값과 충돌할 수 있습니다.`);
      for (const section of drug.sections) if (section.fieldDefinitionId) {
        const source = backupFields.get(section.fieldDefinitionId); const target = currentFields.get(section.fieldDefinitionId);
        if (!source) warnings.push(`${section.title}의 필드 정의가 백업에 없습니다.`);
        else if (target && (target.name !== string(source.name) || target.inputMode !== string(source.inputMode))) warnings.push(`${section.title}의 필드 정의 ID가 현재 DB와 충돌합니다.`);
      }
      for (const id of referencedTaxonIds(drug.sections)) {
        const source = backupTaxa.get(id); const target = currentTaxa.get(id);
        if (!source) warnings.push(`연결된 성분 분류 ${id}가 백업에 없습니다.`);
        else if (target && (target.name !== string(source.name) || target.kind !== string(source.kind))) warnings.push(`연결된 성분 분류 ${string(source.name)}의 ID가 현재 DB와 충돌합니다.`);
      }
      for (const relation of backupRelationships.filter((row) => row.sourceId === drug.id)) if (!current.has(string(relation.targetId))) warnings.push(`연결 대상 Data Card ${string(relation.targetId)}가 현재 DB에 없어 Identification 복원이 중단됩니다.`);
      return { id: drug.id, koreanName: drug.koreanName, catalogIndex: drug.catalogIndex, referenceIndex: drug.referenceIndex, exists: current.has(drug.id), fields: restoreFieldOptions(drug), warnings };
    }),
  };
}

export async function commitSelectiveRestore(buffer: Buffer, selections: RestoreSelection[]) {
  const archive = await parseBackupArchive(buffer);
  const backupDrugs = new Map(archive.tables["crude-drugs"].map((row) => { const drug = backupDrugSchema.parse(row); return [drug.id, drug] as const; }));
  const backupCategories = archive.tables.categories.map(record);
  const backupFamilies = archive.tables.families.map(record);
  const backupFields = archive.tables["field-definitions"].map(record);
  const backupRelationships = archive.tables["crude-drug-relationships"].map(record);
  const backupRelationshipTypes = archive.tables["relationship-types"].map(record);
  const backupIdentityLinks = archive.tables["crude-drug-identity-terms"].map(record);
  const backupIdentityTerms = archive.tables["drug-identity-terms"].map(record);
  const backupConstituentLinks = archive.tables["crude-drug-constituents"].map(record);
  const backupConstituents = archive.tables.constituents.map(record);
  const backupTaxa = archive.tables["constituent-taxa"].map(record);
  const backupTaxonEdges = archive.tables["constituent-taxon-edges"].map(record);
  const backupMediaRows = new Map(archive.tables["media-assets"].map((row) => { const value = record(row); return [string(value.id), value] as const; }));

  if (!selections.length) throw new Error("복원할 Data Card를 선택해주세요.");
  for (const selection of selections) {
    const drug = backupDrugs.get(selection.drugId);
    if (!drug) throw new Error(`선택한 Data Card ${selection.drugId}가 백업에 없습니다.`);
    const valid = new Set(restoreFieldOptions(drug).map((field) => field.key));
    if (!selection.fields.length || selection.fields.some((field) => !valid.has(field))) throw new Error(`${drug.koreanName}의 복원 필드 선택이 올바르지 않습니다.`);
  }

  const currentDrugs = await db.select().from(schema.crudeDrugs).where(inArray(schema.crudeDrugs.id, selections.map((item) => item.drugId)));
  const currentById = new Map(currentDrugs.map((drug) => [drug.id, drug]));
  for (const selection of selections) if (!currentById.has(selection.drugId)) throw new Error(`현재 DB에 Data Card ${selection.drugId}가 없어 선택 복원할 수 없습니다.`);

  const mediaIds = new Set<string>();
  const selectedSections = new Map<string, Set<string>>();
  for (const selection of selections) {
    const drug = backupDrugs.get(selection.drugId)!;
    const sectionIds = new Set(selection.fields.filter((field) => field.startsWith("section:")).map((field) => field.slice(8)));
    selectedSections.set(selection.drugId, sectionIds);
    for (const id of referencedMediaIds(drug.sections.filter((section) => sectionIds.has(section.id)))) mediaIds.add(id);
  }
  const mediaMap = new Map<string, string>();
  const newMediaRows: (typeof schema.mediaAssets.$inferInsert)[] = [];
  for (const id of mediaIds) {
    const backupRow = backupMediaRows.get(id);
    const bytes = archive.media.get(id);
    if (!backupRow || !bytes) throw new Error(`복원에 필요한 미디어 ${id}가 백업에 없습니다.`);
    const [current] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, id)).limit(1);
    if (current) {
      const currentBytes = await readMediaAssetBytes(current).catch(() => null);
      if (currentBytes && sha256(currentBytes) === string(backupRow.sha256)) { mediaMap.set(id, id); continue; }
    }
    const nextId = current ? crypto.randomUUID() : id;
    mediaMap.set(id, nextId);
    newMediaRows.push({ id: nextId, blobUrl: `data:${string(backupRow.mimeType)};base64,${bytes.toString("base64")}`, blobPathname: `database/restore-${nextId}-${safeName(nullableString(backupRow.originalFilename) ?? "image")}`, originalFilename: nullableString(backupRow.originalFilename), sizeBytes: bytes.length, mimeType: string(backupRow.mimeType), width: number(backupRow.width), height: number(backupRow.height) });
  }

  return db.transaction(async (tx) => {
    if (newMediaRows.length) await tx.insert(schema.mediaAssets).values(newMediaRows);
    const fieldMap = new Map<string, string>();
    const taxonMap = new Map<string, string>();
    const requiredFieldIds = new Set<string>();
    const requiredTaxonIds = new Set<string>();
    for (const selection of selections) {
      const sectionIds = selectedSections.get(selection.drugId)!;
      const sections = backupDrugs.get(selection.drugId)!.sections.filter((section) => sectionIds.has(section.id));
      for (const section of sections) if (section.fieldDefinitionId) requiredFieldIds.add(section.fieldDefinitionId);
      for (const id of referencedTaxonIds(sections)) requiredTaxonIds.add(id);
    }
    // A linked taxonomy node needs its ancestor chain so lineage UI remains intact.
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of backupTaxonEdges) if (requiredTaxonIds.has(string(edge.childId)) && !requiredTaxonIds.has(string(edge.parentId))) { requiredTaxonIds.add(string(edge.parentId)); grew = true; }
    }
    for (const id of requiredFieldIds) {
      const source = backupFields.find((row) => row.id === id);
      if (!source) throw new Error(`필드 정의 ${id}가 백업에 없습니다.`);
      const [sameId] = await tx.select().from(schema.fieldDefinitions).where(eq(schema.fieldDefinitions.id, id)).limit(1);
      if (sameId && (sameId.name !== string(source.name) || sameId.inputMode !== string(source.inputMode))) throw new Error(`필드 정의 ${id}가 현재 DB와 충돌합니다.`);
      let target = sameId;
      if (!target) [target] = await tx.select().from(schema.fieldDefinitions).where(eq(schema.fieldDefinitions.name, string(source.name))).limit(1);
      if (!target) [target] = await tx.insert(schema.fieldDefinitions).values({ id, name: string(source.name), kind: enumValue(source.kind, ["default", "custom"] as const), inputMode: enumValue(source.inputMode, ["hierarchy4", "hierarchy3", "text"] as const), position: number(source.position), active: boolean(source.active) }).returning();
      fieldMap.set(id, target.id);
    }
    for (const id of requiredTaxonIds) {
      const source = backupTaxa.find((row) => row.id === id);
      if (!source) throw new Error(`성분 분류 ${id}가 백업에 없습니다.`);
      const [sameId] = await tx.select().from(schema.constituentTaxa).where(eq(schema.constituentTaxa.id, id)).limit(1);
      if (sameId && (sameId.name !== string(source.name) || sameId.kind !== string(source.kind))) throw new Error(`성분 분류 ${id}가 현재 DB와 충돌합니다.`);
      let target = sameId;
      if (!target) [target] = await tx.select().from(schema.constituentTaxa).where(andNameKind(string(source.name), string(source.kind))).limit(1);
      if (!target) [target] = await tx.insert(schema.constituentTaxa).values({ id, name: string(source.name), kind: string(source.kind), description: nullableString(source.description), hidden: boolean(source.hidden), position: number(source.position) }).returning();
      taxonMap.set(id, target.id);
    }
    for (const edge of backupTaxonEdges) {
      const parentId = taxonMap.get(string(edge.parentId));
      const childId = taxonMap.get(string(edge.childId));
      if (parentId && childId && parentId !== childId) await tx.insert(schema.constituentTaxonEdges).values({ parentId, childId, position: number(edge.position) }).onConflictDoNothing();
    }
    const changes: { drugId: string; koreanName: string; fields: string[] }[] = [];
    for (const selection of selections) {
      const backup = structuredClone(backupDrugs.get(selection.drugId)!);
      backup.sections = backup.sections.map((section) => {
        const withMedia = rewriteSectionMedia(section, mediaMap);
        const withTaxa = rewriteSectionTaxa(withMedia, taxonMap);
        return withTaxa.fieldDefinitionId && fieldMap.has(withTaxa.fieldDefinitionId) ? { ...withTaxa, fieldDefinitionId: fieldMap.get(withTaxa.fieldDefinitionId)! } : withTaxa;
      });
      const current = backupDrugSchema.parse(currentById.get(selection.drugId));
      let categoryId = selection.fields.includes("basic") ? backup.categoryId : current.categoryId;
      let familyId = selection.fields.includes("family") ? backup.familyId : current.familyId;

      if (selection.fields.includes("basic") && backup.categoryId) {
        const source = backupCategories.find((row) => row.id === backup.categoryId);
        if (!source) throw new Error(`${backup.koreanName}의 category dependency가 백업에 없습니다.`);
        const [sameId] = await tx.select().from(schema.categories).where(eq(schema.categories.id, backup.categoryId)).limit(1);
        if (sameId && sameId.slug !== string(source.slug)) throw new Error(`Category ${backup.categoryId}가 현재 DB와 충돌합니다.`);
        let target = sameId;
        if (!target) [target] = await tx.select().from(schema.categories).where(eq(schema.categories.slug, string(source.slug))).limit(1);
        if (!target) [target] = await tx.insert(schema.categories).values({ id: backup.categoryId, name: string(source.name), slug: string(source.slug), position: number(source.position) }).returning();
        categoryId = target.id;
      }
      if (selection.fields.includes("family") && backup.familyId) {
        const source = backupFamilies.find((row) => row.id === backup.familyId);
        if (!source) throw new Error(`${backup.koreanName}의 Family dependency가 백업에 없습니다.`);
        const [sameId] = await tx.select().from(schema.families).where(eq(schema.families.id, backup.familyId)).limit(1);
        if (sameId && sameId.scientificName !== string(source.scientificName)) throw new Error(`Family ${backup.familyId}가 현재 DB와 충돌합니다.`);
        let target = sameId;
        if (!target) [target] = await tx.select().from(schema.families).where(eq(schema.families.scientificName, string(source.scientificName))).limit(1);
        if (!target) [target] = await tx.insert(schema.families).values({ id: backup.familyId, koreanName: string(source.koreanName), scientificName: string(source.scientificName), acceptedScientificName: nullableString(source.acceptedScientificName), summary: array(source.summary) as schema.StudyItem[], summaryBlocks: array(source.summaryBlocks) as schema.StudyBlock[] }).returning();
        familyId = target.id;
      }

      const restored = applySelectedDrugFields(current, backup, selection.fields, { categoryId, familyId });
      await tx.update(schema.crudeDrugs).set({ catalogIndex: restored.catalogIndex, referenceIndex: restored.referenceIndex, koreanName: restored.koreanName, latinName: restored.latinName, origin: restored.origin, origins: restored.origins, scientificName: restored.scientificName, medicinalPart: restored.medicinalPart, categoryId: restored.categoryId, familyId: restored.familyId, importance: restored.importance, sections: restored.sections, updatedAt: new Date() }).where(eq(schema.crudeDrugs.id, selection.drugId));

      if (selection.fields.includes("identification")) {
        await tx.delete(schema.crudeDrugRelationships).where(eq(schema.crudeDrugRelationships.sourceId, selection.drugId));
        for (const relation of backupRelationships.filter((row) => row.sourceId === selection.drugId)) {
          const targetId = string(relation.targetId);
          const [targetDrug] = await tx.select({ id: schema.crudeDrugs.id }).from(schema.crudeDrugs).where(eq(schema.crudeDrugs.id, targetId)).limit(1);
          if (!targetDrug) throw new Error(`관계 대상 Data Card ${targetId}가 현재 DB에 없습니다.`);
          const typeSource = backupRelationshipTypes.find((row) => row.id === relation.typeId);
          if (!typeSource) throw new Error("관계 유형 dependency가 백업에 없습니다.");
          const [sameTypeId] = await tx.select().from(schema.relationshipTypes).where(eq(schema.relationshipTypes.id, string(typeSource.id))).limit(1);
          if (sameTypeId && sameTypeId.name !== string(typeSource.name)) throw new Error(`관계 유형 ${string(typeSource.id)}가 현재 DB와 충돌합니다.`);
          let type = sameTypeId;
          if (!type) [type] = await tx.select().from(schema.relationshipTypes).where(eq(schema.relationshipTypes.name, string(typeSource.name))).limit(1);
          if (!type) [type] = await tx.insert(schema.relationshipTypes).values({ id: string(typeSource.id), name: string(typeSource.name) }).returning();
          const relationId = string(relation.id);
          const [idConflict] = await tx.select({ id: schema.crudeDrugRelationships.id }).from(schema.crudeDrugRelationships).where(eq(schema.crudeDrugRelationships.id, relationId)).limit(1);
          await tx.insert(schema.crudeDrugRelationships).values({ id: idConflict ? crypto.randomUUID() : relationId, sourceId: selection.drugId, targetId, typeId: type.id, notes: nullableString(relation.notes) });
        }
        await tx.delete(schema.crudeDrugIdentityTerms).where(eq(schema.crudeDrugIdentityTerms.crudeDrugId, selection.drugId));
        for (const link of backupIdentityLinks.filter((row) => row.crudeDrugId === selection.drugId)) {
          const source = backupIdentityTerms.find((row) => row.id === link.termId);
          if (!source) throw new Error("가공/기타 사항 dependency가 백업에 없습니다.");
          const [sameTermId] = await tx.select().from(schema.drugIdentityTerms).where(eq(schema.drugIdentityTerms.id, string(source.id))).limit(1);
          if (sameTermId && sameTermId.name !== string(source.name)) throw new Error(`가공/기타 용어 ${string(source.id)}가 현재 DB와 충돌합니다.`);
          let term = sameTermId;
          if (!term) [term] = await tx.select().from(schema.drugIdentityTerms).where(eq(schema.drugIdentityTerms.name, string(source.name))).limit(1);
          if (!term) [term] = await tx.insert(schema.drugIdentityTerms).values({ id: string(source.id), name: string(source.name) }).returning();
          await tx.insert(schema.crudeDrugIdentityTerms).values({ crudeDrugId: selection.drugId, termId: term.id, position: number(link.position) });
        }
        await tx.delete(schema.crudeDrugConstituents).where(eq(schema.crudeDrugConstituents.crudeDrugId, selection.drugId));
        for (const link of backupConstituentLinks.filter((row) => row.crudeDrugId === selection.drugId)) {
          const source = backupConstituents.find((row) => row.id === link.constituentId);
          if (!source) throw new Error("Constituent dependency가 백업에 없습니다.");
          const [sameConstituentId] = await tx.select().from(schema.constituents).where(eq(schema.constituents.id, string(source.id))).limit(1);
          if (sameConstituentId && sameConstituentId.name !== string(source.name)) throw new Error(`Constituent ${string(source.id)}가 현재 DB와 충돌합니다.`);
          let constituent = sameConstituentId;
          if (!constituent) [constituent] = await tx.select().from(schema.constituents).where(eq(schema.constituents.name, string(source.name))).limit(1);
          if (!constituent) [constituent] = await tx.insert(schema.constituents).values({ id: string(source.id), name: string(source.name), aliases: array(source.aliases) as string[] }).returning();
          await tx.insert(schema.crudeDrugConstituents).values({ crudeDrugId: selection.drugId, constituentId: constituent.id, notes: nullableString(link.notes) });
        }
      }
      changes.push({ drugId: selection.drugId, koreanName: backup.koreanName, fields: selection.fields });
    }
    return { restored: changes.length, changes, mediaRestored: newMediaRows.length, warnings: ["선택 필드를 대상으로 한 기존 개념 앵커는 삭제하지 않았습니다. 복원 후 상태를 검토해주세요."] };
  });
}

function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("백업 테이블 행 형식이 올바르지 않습니다."); return value as Record<string, unknown>; }
function string(value: unknown) { if (typeof value !== "string") throw new Error("백업의 필수 문자열 값이 올바르지 않습니다."); return value; }
function number(value: unknown) { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("백업의 필수 숫자 값이 올바르지 않습니다."); return value; }
function boolean(value: unknown) { if (typeof value !== "boolean") throw new Error("백업의 필수 boolean 값이 올바르지 않습니다."); return value; }
function nullableString(value: unknown) { return value == null ? null : string(value); }
function array(value: unknown) { if (!Array.isArray(value)) throw new Error("백업의 배열 값이 올바르지 않습니다."); return value; }
function enumValue<T extends string>(value: unknown, values: readonly T[]) { const result = string(value); if (!values.includes(result as T)) throw new Error("백업의 enum 값이 올바르지 않습니다."); return result as T; }
function andNameKind(name: string, kind: string) { return and(eq(schema.constituentTaxa.name, name), eq(schema.constituentTaxa.kind, kind)); }
function safeName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "image"; }
