import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decks } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.delete(decks).where(eq(decks.id, id));
  return new NextResponse(null, { status: 204 });
}

