import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, conceptAnchors } from "@/lib/db/schema";
import { collectionPatchSchema, uuidSchema } from "@/lib/validators";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [row] = await db.select().from(collections).where(eq(collections.id, id)).limit(1); return row ? NextResponse.json(row) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = collectionPatchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [row] = await db.update(collections).set({ ...parsed.data, updatedAt: new Date() }).where(eq(collections.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.update(conceptAnchors).set({ status: "broken", updatedAt: new Date() }).where(eq(conceptAnchors.ownerId, id));
  await db.delete(collections).where(eq(collections.id, id));
  return new NextResponse(null, { status: 204 });
}
