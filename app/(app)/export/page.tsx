import { asc, eq } from "drizzle-orm";
import { DataCardExport } from "@/components/data-card-export";
import { db } from "@/lib/db";
import { categories, constituentMemberships, constituents, constituentTaxa, constituentTaxonEdges, crudeDrugConstituents, crudeDrugIdentityTerms, crudeDrugRelationships, crudeDrugs, drugIdentityTerms, families, relationshipTypes } from "@/lib/db/schema";
import { formatDrugIndex } from "@/lib/drug-index";
import { buildHerbSearchDocument } from "@/lib/herb-search";

export const dynamic = "force-dynamic";

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ drugId?: string }> }) {
  const [{ drugId }, drugs, identityRows, relationshipRows, constituentRows, taxonRows, taxonEdgeRows] = await Promise.all([
    searchParams,
    db.select({
      id: crudeDrugs.id,
      catalogIndex: crudeDrugs.catalogIndex,
      referenceIndex: crudeDrugs.referenceIndex,
      koreanName: crudeDrugs.koreanName,
      latinName: crudeDrugs.latinName,
      importance: crudeDrugs.importance,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryPosition: categories.position,
      origin: crudeDrugs.origin,
      origins: crudeDrugs.origins,
      scientificName: crudeDrugs.scientificName,
      medicinalPart: crudeDrugs.medicinalPart,
      sections: crudeDrugs.sections,
      familyKoreanName: families.koreanName,
      familyScientificName: families.scientificName,
      familyAcceptedScientificName: families.acceptedScientificName,
    }).from(crudeDrugs).leftJoin(categories, eq(crudeDrugs.categoryId, categories.id)).leftJoin(families, eq(crudeDrugs.familyId, families.id)).orderBy(asc(categories.position), asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)),
    db.select({ drugId: crudeDrugIdentityTerms.crudeDrugId, name: drugIdentityTerms.name }).from(crudeDrugIdentityTerms).innerJoin(drugIdentityTerms, eq(drugIdentityTerms.id, crudeDrugIdentityTerms.termId)),
    db.select({ sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId, type: relationshipTypes.name, notes: crudeDrugRelationships.notes }).from(crudeDrugRelationships).innerJoin(relationshipTypes, eq(relationshipTypes.id, crudeDrugRelationships.typeId)),
    db.select({ drugId: crudeDrugConstituents.crudeDrugId, name: constituents.name, aliases: constituents.aliases, notes: crudeDrugConstituents.notes, taxonId: constituentTaxa.id }).from(crudeDrugConstituents).innerJoin(constituents, eq(constituents.id, crudeDrugConstituents.constituentId)).leftJoin(constituentMemberships, eq(constituentMemberships.constituentId, constituents.id)).leftJoin(constituentTaxa, eq(constituentTaxa.id, constituentMemberships.taxonId)),
    db.select({ id: constituentTaxa.id, name: constituentTaxa.name }).from(constituentTaxa),
    db.select({ parentId: constituentTaxonEdges.parentId, childId: constituentTaxonEdges.childId }).from(constituentTaxonEdges),
  ]);
  const names = new Map(drugs.map((drug) => [drug.id, drug.koreanName]));
  const identityByDrug = group(identityRows, (row) => row.drugId);
  const relationshipsByDrug = new Map<string, { type: string; drugName: string; notes: string | null }[]>();
  for (const row of relationshipRows) for (const [sourceId, targetId] of [[row.sourceId, row.targetId], [row.targetId, row.sourceId]] as const) {
    const name = names.get(targetId);
    if (name) relationshipsByDrug.set(sourceId, [...(relationshipsByDrug.get(sourceId) ?? []), { type: row.type, drugName: name, notes: row.notes }]);
  }
  const taxonNames = new Map(taxonRows.map((row) => [row.id, row.name]));
  const parentsByTaxon = group(taxonEdgeRows, (row) => row.childId);
  const lineage = (id: string) => {
    const result: string[] = []; const visited = new Set<string>(); const pending = [id];
    while (pending.length) { const current = pending.shift()!; if (visited.has(current)) continue; visited.add(current); const name = taxonNames.get(current); if (name) result.push(name); pending.push(...(parentsByTaxon.get(current) ?? []).map((edge) => edge.parentId)); }
    return result;
  };
  const constituentsByDrug = new Map<string, { name: string; aliases: string[]; notes: string | null; taxa: string[] }[]>();
  for (const row of constituentRows) {
    const list = constituentsByDrug.get(row.drugId) ?? [];
    let item = list.find((value) => value.name === row.name);
    if (!item) { item = { name: row.name, aliases: row.aliases, notes: row.notes, taxa: [] }; list.push(item); constituentsByDrug.set(row.drugId, list); }
    if (row.taxonId) for (const name of lineage(row.taxonId)) if (!item.taxa.includes(name)) item.taxa.push(name);
  }
  const searchable = drugs.map((drug) => ({
    id: drug.id, catalogIndex: drug.catalogIndex, referenceIndex: drug.referenceIndex, koreanName: drug.koreanName, latinName: drug.latinName, importance: drug.importance,
    categoryId: drug.categoryId, categoryName: drug.categoryName, categoryPosition: drug.categoryPosition,
    searchDocument: buildHerbSearchDocument({
      index: formatDrugIndex(drug.catalogIndex, drug.referenceIndex), koreanName: drug.koreanName, latinName: drug.latinName, origin: drug.origin, origins: drug.origins,
      scientificName: drug.scientificName, medicinalPart: drug.medicinalPart, categoryName: drug.categoryName,
      family: drug.familyKoreanName && drug.familyScientificName ? { koreanName: drug.familyKoreanName, scientificName: drug.familyScientificName, acceptedScientificName: drug.familyAcceptedScientificName } : null,
      sections: drug.sections, constituents: constituentsByDrug.get(drug.id), identityTerms: (identityByDrug.get(drug.id) ?? []).map((item) => item.name), relationships: relationshipsByDrug.get(drug.id),
    }),
  }));
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Study material</p><h1>Export</h1><p className="subtitle">선택한 Data Card를 Word DOCX 학습 자료로 내보냅니다.</p></div></header><DataCardExport drugs={searchable} initialDrugId={drugId}/></div>;
}

function group<T, K>(rows: T[], key: (row: T) => K) {
  const result = new Map<K, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}
