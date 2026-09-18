import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { collectionMembers } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

const bodySchema = z.object({ crudeDrugId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.insert(collectionMembers).values({ collectionId: id, crudeDrugId: parsed.data.crudeDrugId }).onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.delete(collectionMembers).where(and(eq(collectionMembers.collectionId, id), eq(collectionMembers.crudeDrugId, parsed.data.crudeDrugId)));
  return new NextResponse(null, { status: 204 });
}

