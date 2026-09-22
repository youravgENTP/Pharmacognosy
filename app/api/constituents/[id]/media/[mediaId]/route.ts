import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentMedia } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; mediaId: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id, mediaId } = await params; const parsed = z.object({ caption: z.string().trim().max(300).nullable().optional(), position: z.number().int().nonnegative().optional() }).refine((value) => Object.keys(value).length > 0).safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(mediaId).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [updated] = await db.update(constituentMedia).set(parsed.data).where(and(eq(constituentMedia.id, mediaId), eq(constituentMedia.constituentId, id))).returning();
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; mediaId: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id, mediaId } = await params; if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(mediaId).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await db.delete(constituentMedia).where(and(eq(constituentMedia.id, mediaId), eq(constituentMedia.constituentId, id)));
  return new NextResponse(null, { status: 204 });
}
