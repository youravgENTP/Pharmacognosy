import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crudeDrugs } from "@/lib/db/schema";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";

export async function POST(request: Request) {
  const parsed = pharmacognosyImportV1Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ valid: false, errors: parsed.error.issues }, { status: 400 });
  const names = parsed.data.drugs.map((drug) => drug.koreanName);
  const existing = names.length ? await db.select({ koreanName: crudeDrugs.koreanName }).from(crudeDrugs).where(inArray(crudeDrugs.koreanName, names)) : [];
  const existingNames = new Set(existing.map((row) => row.koreanName));
  return NextResponse.json({
    valid: true,
    summary: { total: names.length, new: names.filter((name) => !existingNames.has(name)).length, existing: existing.length },
    drugs: parsed.data.drugs.map((drug) => ({ ...drug, exists: existingNames.has(drug.koreanName) })),
  });
}

