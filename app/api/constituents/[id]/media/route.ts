import { authorizeApi } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentMedia } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const parsed = z.object({ mediaAssetId: z.string().uuid(), caption: z.string().trim().max(300).nullable().optional() }).safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const existing = await db.select({ position: constituentMedia.position }).from(constituentMedia).where(eq(constituentMedia.constituentId, id));
  const [created] = await db.insert(constituentMedia).values({ constituentId: id, mediaAssetId: parsed.data.mediaAssetId, caption: parsed.data.caption, position: existing.length }).onConflictDoNothing().returning();
  return NextResponse.json(created ?? { duplicate: true }, { status: created ? 201 : 200 });
}
