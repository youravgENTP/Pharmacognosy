import { authorizeApi } from "@/lib/auth/permissions";
import { asc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionMembers, conceptAnchors, conceptConnections, crudeDrugs } from "@/lib/db/schema";
import { collectionCreateSchema } from "@/lib/validators";

export async function GET() { const authError = await authorizeApi("user"); if (authError) return authError;
  const rows = await db.select({ id: collections.id, name: collections.name, description: collections.description, revision: collections.revision, createdAt: collections.createdAt, updatedAt: collections.updatedAt }).from(collections).orderBy(asc(collections.createdAt));
  const members = await db.select({ collectionId: collectionMembers.collectionId, id: crudeDrugs.id, koreanName: crudeDrugs.koreanName }).from(collectionMembers).innerJoin(crudeDrugs, eq(collectionMembers.crudeDrugId, crudeDrugs.id));
  const anchors = rows.length ? await db.select().from(conceptAnchors).where(inArray(conceptAnchors.ownerId, rows.map((row) => row.id))) : [];
  const ids = anchors.map((anchor) => anchor.id); const connections = ids.length ? await db.select().from(conceptConnections).where(or(inArray(conceptConnections.anchorAId, ids), inArray(conceptConnections.anchorBId, ids))) : [];
  const relatedIds = [...new Set(connections.flatMap((edge) => [edge.anchorAId, edge.anchorBId]))]; const graphAnchors = relatedIds.length ? await db.select().from(conceptAnchors).where(inArray(conceptAnchors.id, relatedIds)) : anchors;
  return NextResponse.json(rows.map((row) => { const owned = anchors.filter((anchor) => anchor.ownerType === "collection" && anchor.ownerId === row.id); const ownedIds = new Set(owned.map((anchor) => anchor.id)); const unresolved = connections.some((edge) => { if (!ownedIds.has(edge.anchorAId) && !ownedIds.has(edge.anchorBId)) return false; const ownAnchor = graphAnchors.find((anchor) => anchor.id === (ownedIds.has(edge.anchorAId) ? edge.anchorAId : edge.anchorBId)); const otherIsA = ownedIds.has(edge.anchorBId); const otherAnchor = graphAnchors.find((anchor) => anchor.id === (otherIsA ? edge.anchorAId : edge.anchorBId)); return Boolean((ownAnchor?.status === "broken" || ownAnchor?.status === "updated") && (ownedIds.has(edge.anchorAId) ? !edge.historicalA : !edge.historicalB) || (otherAnchor?.status === "broken" || otherAnchor?.status === "updated") && (otherIsA ? !edge.historicalA : !edge.historicalB)); }); return { ...row, unresolved, members: members.filter((m) => m.collectionId === row.id) }; }));
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = collectionCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [created] = await db.insert(collections).values(parsed.data).returning();
  return NextResponse.json(created, { status: 201 });
}
