import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { collectionDocumentPatchSchema, uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = collectionDocumentPatchSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [updated] = await db.update(collections).set({ document: parsed.data.document, revision: parsed.data.revision + 1, updatedAt: new Date() }).where(and(eq(collections.id, id), eq(collections.revision, parsed.data.revision))).returning();
  if (!updated) return NextResponse.json({ error: "Collection changed in another session", code: "REVISION_CONFLICT" }, { status: 409 });
  return NextResponse.json({ revision: updated.revision, updatedAt: updated.updatedAt });
}
