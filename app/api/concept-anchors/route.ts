import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serializeConceptAnchorTargetRef } from "@/lib/concept-target-ref";
import { db } from "@/lib/db";
import { conceptAnchors } from "@/lib/db/schema";
import { getOwnerConceptGraph, snapshotHash } from "@/lib/concepts";
import { conceptAnchorCreateSchema, conceptOwnerTypeSchema, uuidSchema } from "@/lib/validators";

export async function GET(request: Request) { const authError = await authorizeApi("user"); if (authError) return authError;
  const url = new URL(request.url); const ownerType = conceptOwnerTypeSchema.safeParse(url.searchParams.get("ownerType")); const ownerId = uuidSchema.safeParse(url.searchParams.get("ownerId"));
  if (!ownerType.success || !ownerId.success) return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
  return NextResponse.json(await getOwnerConceptGraph(ownerType.data, ownerId.data));
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = conceptAnchorCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const match = await db.select().from(conceptAnchors).where(and(eq(conceptAnchors.ownerType, parsed.data.ownerType), eq(conceptAnchors.ownerId, parsed.data.ownerId), eq(conceptAnchors.targetType, parsed.data.targetType)));
  const serializedTargetRef = serializeConceptAnchorTargetRef(parsed.data.targetRef);
  const existing = match.find((anchor) => serializeConceptAnchorTargetRef(anchor.targetRef) === serializedTargetRef && anchor.startOffset === (parsed.data.startOffset ?? null) && anchor.endOffset === (parsed.data.endOffset ?? null) && anchor.status !== "broken");
  if (existing) return NextResponse.json(existing);
  const [created] = await db.insert(conceptAnchors).values({ ...parsed.data, startOffset: parsed.data.startOffset ?? null, endOffset: parsed.data.endOffset ?? null, snapshotText: parsed.data.snapshotText ?? null, snapshotHash: snapshotHash(parsed.data.snapshotText), assetVersion: parsed.data.assetVersion ?? null }).returning();
  return NextResponse.json(created, { status: 201 });
}
