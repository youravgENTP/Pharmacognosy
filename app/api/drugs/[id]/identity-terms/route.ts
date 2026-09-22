import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crudeDrugIdentityTerms } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const parsed = z.object({ termId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const existing = await db.select({ position: crudeDrugIdentityTerms.position }).from(crudeDrugIdentityTerms).where(eq(crudeDrugIdentityTerms.crudeDrugId, id));
  await db.insert(crudeDrugIdentityTerms).values({ crudeDrugId: id, termId: parsed.data.termId, position: existing.length }).onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}
