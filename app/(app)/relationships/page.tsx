import { asc, eq } from "drizzle-orm";
import { RelationshipsOverview, type RelationshipEdge } from "@/components/relationships-overview";
import { db } from "@/lib/db";
import { crudeDrugRelationships, crudeDrugs, relationshipTypes } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function RelationshipsPage() {
  const [drugs, relationships] = await Promise.all([
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex }).from(crudeDrugs).orderBy(asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)),
    db.select({ id: crudeDrugRelationships.id, sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId, type: relationshipTypes.name }).from(crudeDrugRelationships).innerJoin(relationshipTypes, eq(relationshipTypes.id, crudeDrugRelationships.typeId)),
  ]);
  const drugMap = new Map(drugs.map((drug) => [drug.id, drug]));
  const edges = relationships.flatMap((relationship): RelationshipEdge[] => {
    const source = drugMap.get(relationship.sourceId); const target = drugMap.get(relationship.targetId);
    if (!source || !target) return [];
    return [{ id: relationship.id, type: relationship.type === "유사생약" ? "유사생약" : "연관생약", source, target }];
  });
  return <div className="page wide"><RelationshipsOverview edges={edges}/></div>;
}
