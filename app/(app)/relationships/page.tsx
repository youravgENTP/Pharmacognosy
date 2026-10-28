import { asc, eq } from "drizzle-orm";
import { RelationshipsOverview, type RelationshipEdge } from "@/components/relationships-overview";
import { db } from "@/lib/db";
import { archiveEntries, archiveGroups, crudeDrugRelationships, crudeDrugs, relationshipTypes } from "@/lib/db/schema";
import { classifyRelationship } from "@/lib/relationship-archive";

export const dynamic = "force-dynamic";

export default async function RelationshipsPage() {
  const [drugs, relationships] = await Promise.all([
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, archivePrefix: archiveGroups.prefix, archiveName: archiveGroups.name, archiveOriginalIndexType: archiveEntries.originalIndexType, archiveOriginalIndex: archiveEntries.originalIndex }).from(crudeDrugs).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).leftJoin(archiveGroups, eq(archiveGroups.id, archiveEntries.archiveGroupId)).orderBy(asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex), asc(archiveEntries.originalIndex)),
    db.select({ id: crudeDrugRelationships.id, sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId, type: relationshipTypes.name }).from(crudeDrugRelationships).innerJoin(relationshipTypes, eq(relationshipTypes.id, crudeDrugRelationships.typeId)),
  ]);
  const drugMap = new Map(drugs.map((drug) => [drug.id, { ...drug, archive: drug.archivePrefix && drug.archiveOriginalIndex != null ? { prefix: drug.archivePrefix, name: drug.archiveName!, originalIndexType: drug.archiveOriginalIndexType ?? "catalog", originalIndex: drug.archiveOriginalIndex } : null }]));
  const edges = relationships.flatMap((relationship): RelationshipEdge[] => {
    const source = drugMap.get(relationship.sourceId); const target = drugMap.get(relationship.targetId);
    if (!source || !target) return [];
    return [{ id: relationship.id, type: relationship.type === "유사생약" ? "유사생약" : "연관생약", source, target, status: classifyRelationship(Boolean(source.archive), Boolean(target.archive)) }];
  });
  return <div className="page wide"><RelationshipsOverview edges={edges}/></div>;
}
