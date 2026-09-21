import { authorizeApi } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { wordCards } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  const parsed = z.object({ front: z.string().trim().min(1), back: z.string().trim().min(1), crudeDrugId: z.string().uuid().nullable().optional(), collectionId: z.string().uuid().nullable().optional() }).safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [row] = await db.insert(wordCards).values({ deckId: id, ...parsed.data }).returning();
  return NextResponse.json(row, { status: 201 });
}

