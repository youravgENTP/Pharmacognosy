import { authorizeApi } from "@/lib/auth/permissions";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conceptAnchors, conceptConnections } from "@/lib/db/schema";
import { endpointSnapshot, snapshotHash } from "@/lib/concepts";
import { conceptAnchorPatchSchema, uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = conceptAnchorPatchSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { refreshSnapshots, ...patch } = parsed.data;
  const [updated] = await db.update(conceptAnchors).set({ ...patch, ...(patch.snapshotText !== undefined ? { snapshotHash: snapshotHash(patch.snapshotText) } : {}), updatedAt: new Date() }).where(eq(conceptAnchors.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (refreshSnapshots) {
    const snapshot = endpointSnapshot(updated);
    const edges = await db.select().from(conceptConnections).where(or(eq(conceptConnections.anchorAId, id), eq(conceptConnections.anchorBId, id)));
    await Promise.all(edges.map((edge) => db.update(conceptConnections).set(edge.anchorAId === id ? { anchorASnapshot: snapshot, historicalA: false, updatedAt: new Date() } : { anchorBSnapshot: snapshot, historicalB: false, updatedAt: new Date() }).where(eq(conceptConnections.id, edge.id))));
  }
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [updated] = await db.update(conceptAnchors).set({ status: "broken", updatedAt: new Date() }).where(eq(conceptAnchors.id, id)).returning();
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
