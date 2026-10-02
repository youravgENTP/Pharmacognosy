import { asc, eq } from "drizzle-orm";
import { DrugBoard } from "@/components/drug-board";
import { db } from "@/lib/db";
import { categories, constituentMemberships, constituents, constituentTaxa, constituentTaxonEdges, crudeDrugConstituents, crudeDrugIdentityTerms, crudeDrugRelationships, crudeDrugs, drugIdentityTerms, families, relationshipTypes } from "@/lib/db/schema";
import { formatDrugIndex } from "@/lib/drug-index";
import { buildHerbSearchDocument } from "@/lib/herb-search";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [rows, identityRows, relationshipRows, constituentRows, taxonRows, taxonEdgeRows] = await Promise.all([
    db.select({
      categoryId: categories.id, categoryName: categories.name, categorySlug: categories.slug, categoryPosition: categories.position,
      id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName,
      origin: crudeDrugs.origin, origins: crudeDrugs.origins, scientificName: crudeDrugs.scientificName, medicinalPart: crudeDrugs.medicinalPart, importance: crudeDrugs.importance, sections: crudeDrugs.sections,
      familyKoreanName: families.koreanName, familyScientificName: families.scientificName, familyAcceptedScientificName: families.acceptedScientificName,
    }).from(categories).leftJoin(crudeDrugs, eq(crudeDrugs.categoryId, categories.id)).leftJoin(families, eq(crudeDrugs.familyId, families.id)).orderBy(asc(categories.position), asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)),
    db.select({ drugId: crudeDrugIdentityTerms.crudeDrugId, name: drugIdentityTerms.name }).from(crudeDrugIdentityTerms).innerJoin(drugIdentityTerms, eq(drugIdentityTerms.id, crudeDrugIdentityTerms.termId)),
    db.select({ sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId, type: relationshipTypes.name, notes: crudeDrugRelationships.notes }).from(crudeDrugRelationships).innerJoin(relationshipTypes, eq(relationshipTypes.id, crudeDrugRelationships.typeId)),
    db.select({ drugId: crudeDrugConstituents.crudeDrugId, name: constituents.name, aliases: constituents.aliases, notes: crudeDrugConstituents.notes, taxonId: constituentTaxa.id }).from(crudeDrugConstituents).innerJoin(constituents, eq(constituents.id, crudeDrugConstituents.constituentId)).leftJoin(constituentMemberships, eq(constituentMemberships.constituentId, constituents.id)).leftJoin(constituentTaxa, eq(constituentTaxa.id, constituentMemberships.taxonId)),
    db.select({ id: constituentTaxa.id, name: constituentTaxa.name }).from(constituentTaxa),
    db.select({ parentId: constituentTaxonEdges.parentId, childId: constituentTaxonEdges.childId }).from(constituentTaxonEdges),
  ]);
  const drugNames = new Map(rows.filter((row) => row.id && row.koreanName).map((row) => [row.id!, row.koreanName!]));
  const identityByDrug = group(identityRows, (row) => row.drugId);
  const relationshipsByDrug = new Map<string, { type: string; drugName: string; notes: string | null }[]>();
  for (const row of relationshipRows) for (const [drugId, targetId] of [[row.sourceId, row.targetId], [row.targetId, row.sourceId]] as const) {
    const drugName = drugNames.get(targetId);
    if (drugName) relationshipsByDrug.set(drugId, [...(relationshipsByDrug.get(drugId) ?? []), { type: row.type, drugName, notes: row.notes }]);
  }
  const taxonNames = new Map(taxonRows.map((row) => [row.id, row.name]));
  const parentsByTaxon = group(taxonEdgeRows, (row) => row.childId);
  const taxonLineage = (id: string) => {
    const names: string[] = []; const visited = new Set<string>(); const pending = [id];
    while (pending.length) {
      const current = pending.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const name = taxonNames.get(current); if (name) names.push(name);
      pending.push(...(parentsByTaxon.get(current) ?? []).map((edge) => edge.parentId));
    }
    return names;
  };
  const constituentsByDrug = new Map<string, { name: string; aliases: string[]; notes: string | null; taxa: string[] }[]>();
  for (const row of constituentRows) {
    const list = constituentsByDrug.get(row.drugId) ?? [];
    let item = list.find((value) => value.name === row.name);
    if (!item) { item = { name: row.name, aliases: row.aliases, notes: row.notes, taxa: [] }; list.push(item); constituentsByDrug.set(row.drugId, list); }
    if (row.taxonId) for (const taxonName of taxonLineage(row.taxonId)) if (!item.taxa.includes(taxonName)) item.taxa.push(taxonName);
  }
  const grouped = Array.from(rows.reduce((map, row) => {
    if (!map.has(row.categoryId)) map.set(row.categoryId, { id: row.categoryId, name: row.categoryName, slug: row.categorySlug, drugs: [] });
    if (row.id && row.koreanName) map.get(row.categoryId)!.drugs.push({
      id: row.id, catalogIndex: row.catalogIndex, referenceIndex: row.referenceIndex, koreanName: row.koreanName, latinName: row.latinName, importance: row.importance!,
      searchDocument: buildHerbSearchDocument({
        index: formatDrugIndex(row.catalogIndex, row.referenceIndex), koreanName: row.koreanName, latinName: row.latinName, origin: row.origin, origins: row.origins ?? [],
        scientificName: row.scientificName, medicinalPart: row.medicinalPart, categoryName: row.categoryName,
        family: row.familyKoreanName && row.familyScientificName ? { koreanName: row.familyKoreanName, scientificName: row.familyScientificName, acceptedScientificName: row.familyAcceptedScientificName } : null,
        sections: row.sections ?? [], constituents: constituentsByDrug.get(row.id), identityTerms: (identityByDrug.get(row.id) ?? []).map((item) => item.name), relationships: relationshipsByDrug.get(row.id),
      }),
    });
    return map;
  }, new Map<string, { id: string; name: string; slug: string; drugs: { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; importance: "중요" | "중간" | "비중요"; searchDocument: ReturnType<typeof buildHerbSearchDocument> }[] }>()).values());
  return <div className="page wide"><DrugBoard categories={grouped}/></div>;
}

function group<T, K>(rows: T[], key: (row: T) => K) {
  const result = new Map<K, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}
