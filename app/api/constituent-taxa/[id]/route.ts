import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentTaxa } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional(), kind: z.enum(["pathway", "class", "subclass"]).optional(), description: z.string().max(1000).nullable().optional() }).safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [row] = await db.update(constituentTaxa).set({ ...parsed.data, updatedAt: new Date() }).where(eq(constituentTaxa.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.delete(constituentTaxa).where(eq(constituentTaxa.id, id));
  return new NextResponse(null, { status: 204 });
}
