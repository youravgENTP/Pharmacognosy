import { authorizeApi } from "@/lib/auth/permissions";
import { and, count, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conceptAnchors, conceptConnections } from "@/lib/db/schema";
import { CONNECTION_PALETTE, endpointSnapshot } from "@/lib/concepts";
import { conceptConnectionCreateSchema } from "@/lib/validators";

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = conceptConnectionCreateSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [anchorAId, anchorBId] = [parsed.data.anchorAId, parsed.data.anchorBId].sort();
  const anchors = await db.select().from(conceptAnchors).where(or(eq(conceptAnchors.id, anchorAId), eq(conceptAnchors.id, anchorBId)));
  const anchorA = anchors.find((anchor) => anchor.id === anchorAId); const anchorB = anchors.find((anchor) => anchor.id === anchorBId);
  if (!anchorA || !anchorB || anchorA.status === "broken" || anchorB.status === "broken") return NextResponse.json({ error: "Both live anchors are required" }, { status: 400 });
  const [existing] = await db.select().from(conceptConnections).where(and(eq(conceptConnections.anchorAId, anchorAId), eq(conceptConnections.anchorBId, anchorBId))).limit(1);
  if (existing) return NextResponse.json(existing);
  const [{ value }] = await db.select({ value: count() }).from(conceptConnections);
  const color = CONNECTION_PALETTE[value % CONNECTION_PALETTE.length];
  const [created] = await db.insert(conceptConnections).values({ anchorAId, anchorBId, color, anchorASnapshot: endpointSnapshot(anchorA), anchorBSnapshot: endpointSnapshot(anchorB) }).returning();
  return NextResponse.json(created, { status: 201 });
}
