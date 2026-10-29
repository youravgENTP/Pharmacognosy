import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crudeDrugs, dataCardRevisions } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";
import { dataCardContentHash } from "@/lib/data-card-integrity";

const contentKeys = ["koreanName", "latinName", "origin", "origins", "scientificName", "medicinalPart", "familyId", "importance", "sections"] as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("user");
  if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const requested = Number(new URL(request.url).searchParams.get("baseRevision"));
  if (!Number.isInteger(requested) || requested < 0) return NextResponse.json({ error: "Invalid base revision" }, { status: 400 });

  const [[current], [baseRow]] = await Promise.all([
    db.select().from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1),
    db.select({ content: dataCardRevisions.content }).from(dataCardRevisions).where(and(eq(dataCardRevisions.drugId, id), eq(dataCardRevisions.revision, requested))).limit(1),
  ]);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const base = baseRow ? pickContent(baseRow.content) : requested === current.dataRevision ? pickContent(current) : null;
  return NextResponse.json({
    baseRevision: requested,
    base,
    baseAvailable: Boolean(base),
    currentRevision: current.dataRevision,
    remote: pickContent(current),
    contentHash: dataCardContentHash(current),
  });
}

function pickContent(source: unknown) {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of contentKeys) result[key] = record[key];
  return result;
}
