import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [row] = await db.update(collections).set({ name: parsed.data.name, updatedAt: new Date() }).where(eq(collections.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.delete(collections).where(eq(collections.id, id));
  return new NextResponse(null, { status: 204 });
}

