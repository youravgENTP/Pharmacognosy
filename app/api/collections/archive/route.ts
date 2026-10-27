import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { collectionArchivePatch } from "@/lib/collection-archive";

const schema = z.object({ collectionIds: z.array(z.string().uuid()).min(1).max(500), action: z.enum(["archive", "unarchive"]) });

export async function POST(request: Request) {
  const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Collection 선택 또는 Archive 작업을 확인해 주세요." }, { status: 400 });
  const ids = [...new Set(parsed.data.collectionIds)];
  const rows = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: collections.id }).from(collections).where(inArray(collections.id, ids));
    if (existing.length !== ids.length) throw new Error("존재하지 않는 Collection이 포함되어 있습니다.");
    return tx.update(collections).set(collectionArchivePatch(parsed.data.action)).where(inArray(collections.id, ids)).returning({ id: collections.id, archivedAt: collections.archivedAt });
  }).catch((error) => error instanceof Error ? error : new Error("Collection Archive 작업에 실패했습니다."));
  if (rows instanceof Error) return NextResponse.json({ error: rows.message }, { status: 409 });
  return NextResponse.json({ action: parsed.data.action, changed: rows.length, collections: rows });
}
