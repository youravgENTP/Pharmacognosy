import { authorizeApi } from "@/lib/auth/permissions";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conceptAnchors, conceptConnections } from "@/lib/db/schema";
import { endpointSnapshot } from "@/lib/concepts";
import { conceptConnectionPatchSchema, uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = conceptConnectionPatchSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [edge] = await db.select().from(conceptConnections).where(eq(conceptConnections.id, id)).limit(1); if (!edge) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const patch: Partial<typeof conceptConnections.$inferInsert> = { updatedAt: new Date() }; if (parsed.data.color) patch.color = parsed.data.color;
  const side = parsed.data.action?.endsWith("-a") ? "a" : parsed.data.action?.endsWith("-b") ? "b" : undefined;
  if (parsed.data.action?.startsWith("accept") && side) { const anchorId = side === "a" ? edge.anchorAId : edge.anchorBId; const [anchor] = await db.select().from(conceptAnchors).where(eq(conceptAnchors.id, anchorId)).limit(1); if (anchor) { if (side === "a") { patch.anchorASnapshot = endpointSnapshot(anchor); patch.historicalA = false; } else { patch.anchorBSnapshot = endpointSnapshot(anchor); patch.historicalB = false; } const siblings = await db.select().from(conceptConnections).where(or(eq(conceptConnections.anchorAId, anchor.id), eq(conceptConnections.anchorBId, anchor.id))); const stillUpdated = siblings.some((sibling) => sibling.id !== edge.id && (sibling.anchorAId === anchor.id ? !sibling.historicalA && sibling.anchorASnapshot.hash !== anchor.snapshotHash : !sibling.historicalB && sibling.anchorBSnapshot.hash !== anchor.snapshotHash)); await db.update(conceptAnchors).set({ status: stillUpdated ? "updated" : "healthy", updatedAt: new Date() }).where(eq(conceptAnchors.id, anchor.id)); } }
  if (parsed.data.action?.startsWith("historical") && side) { if (side === "a") patch.historicalA = true; else patch.historicalB = true; }
  if (parsed.data.action?.startsWith("reassign") && side && parsed.data.replacementAnchorId) { const [anchor] = await db.select().from(conceptAnchors).where(eq(conceptAnchors.id, parsed.data.replacementAnchorId)).limit(1); if (!anchor) return NextResponse.json({ error: "Replacement anchor not found" }, { status: 404 }); const replaced = { id: anchor.id, snapshot: endpointSnapshot(anchor) }; const retained = side === "a" ? { id: edge.anchorBId, snapshot: edge.anchorBSnapshot } : { id: edge.anchorAId, snapshot: edge.anchorASnapshot }; if (replaced.id === retained.id) return NextResponse.json({ error: "An anchor cannot connect to itself" }, { status: 400 }); const [first, second] = [replaced, retained].sort((left, right) => left.id.localeCompare(right.id)); patch.anchorAId = first.id; patch.anchorASnapshot = first.snapshot; patch.historicalA = false; patch.anchorBId = second.id; patch.anchorBSnapshot = second.snapshot; patch.historicalB = false; }
  const [updated] = await db.update(conceptConnections).set(patch).where(eq(conceptConnections.id, id)).returning(); return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError; const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 }); await db.delete(conceptConnections).where(eq(conceptConnections.id, id)); return new NextResponse(null, { status: 204 }); }
