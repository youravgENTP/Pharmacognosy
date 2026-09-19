import { createHash } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { conceptAnchors, conceptConnections } from "@/lib/db/schema";

export const CONNECTION_PALETTE = ["#70a8f7", "#75c6a4", "#e9a66f", "#c69af2", "#ef819b", "#79c8de", "#d4bd64", "#9fa9f6"];
export function snapshotHash(value?: string | null) { return value == null ? null : createHash("sha256").update(value).digest("hex"); }
export function endpointSnapshot(anchor: typeof conceptAnchors.$inferSelect) { return { text: anchor.snapshotText ?? undefined, hash: anchor.snapshotHash ?? undefined, assetVersion: anchor.assetVersion ?? undefined }; }

export async function getOwnerConceptGraph(ownerType: "drug" | "collection", ownerId: string) {
  const anchors = await db.select().from(conceptAnchors).where(eq(conceptAnchors.ownerId, ownerId));
  const owned = anchors.filter((anchor) => anchor.ownerType === ownerType);
  if (!owned.length) return { anchors: [], connections: [] };
  const ids = owned.map((anchor) => anchor.id);
  const connections = await db.select().from(conceptConnections).where(or(inArray(conceptConnections.anchorAId, ids), inArray(conceptConnections.anchorBId, ids)));
  const relatedIds = [...new Set(connections.flatMap((connection) => [connection.anchorAId, connection.anchorBId]))];
  const ownedIds = new Set(ids);
  const remoteIds = relatedIds.filter((id) => !ownedIds.has(id));
  const remoteAnchors = remoteIds.length ? await db.select().from(conceptAnchors).where(inArray(conceptAnchors.id, remoteIds)) : [];
  const graphAnchors = [...new Map([...owned, ...remoteAnchors].map((anchor) => [anchor.id, anchor])).values()];
  return { anchors: graphAnchors, connections };
}
