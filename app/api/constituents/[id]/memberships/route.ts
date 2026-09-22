import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentMemberships } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

const bodySchema = z.object({ taxonId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.insert(constituentMemberships).values({ constituentId: id, taxonId: parsed.data.taxonId }).onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.delete(constituentMemberships).where(and(eq(constituentMemberships.constituentId, id), eq(constituentMemberships.taxonId, parsed.data.taxonId)));
  return new NextResponse(null, { status: 204 });
}
