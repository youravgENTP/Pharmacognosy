import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crudeDrugIdentityTerms } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; termId: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id, termId } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(termId).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.delete(crudeDrugIdentityTerms).where(and(eq(crudeDrugIdentityTerms.crudeDrugId, id), eq(crudeDrugIdentityTerms.termId, termId)));
  return new NextResponse(null, { status: 204 });
}
