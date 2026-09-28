import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, families, fieldDefinitions, userDrugMnemonics } from "@/lib/db/schema";
import { prepareImport } from "@/lib/import-pipeline";
import { normalizeKey } from "@/lib/import-normalization";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";

export async function POST(request: Request) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "editor" && current.role !== "admin") return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const parsed = pharmacognosyImportV1Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false, errors: parsed.error.issues }, { status: 400 });
  const [fields, existingDrugs, familyRows, mnemonics] = await Promise.all([
    db.select().from(fieldDefinitions), db.select().from(crudeDrugs), db.select().from(families),
    db.select({ drugId: userDrugMnemonics.drugId }).from(userDrugMnemonics).where(eq(userDrugMnemonics.userId, current.id)),
  ]);
  const previewFields = fields.some((field) => field.active && normalizeKey(field.name) === normalizeKey("기타")) ? fields : [...fields.filter((field) => normalizeKey(field.name) !== normalizeKey("기타")), { id: "pending-other-field", name: "기타", kind: "custom" as const, inputMode: "hierarchy4" as const, position: Math.max(70, ...fields.map((field) => field.position)) + 10, active: true, createdAt: new Date(), updatedAt: new Date() }];
  const prepared = prepareImport(parsed.data, { fields: previewFields, existingDrugs, families: familyRows, mnemonicDrugIds: new Set(mnemonics.map((row) => row.drugId)) });
  return NextResponse.json({
    valid: true,
    canCommit: prepared.canCommit,
    summary: { total: prepared.drugs.length, new: prepared.drugs.filter((drug) => !drug.existing).length, existing: prepared.drugs.filter((drug) => drug.existing).length, errors: prepared.drugs.reduce((sum, drug) => sum + drug.errors.length, 0), warnings: prepared.drugs.reduce((sum, drug) => sum + drug.warnings.length, 0) },
    drugs: prepared.drugs.map((drug) => ({ koreanName: drug.input.koreanName, category: drug.input.category, exists: Boolean(drug.existing), ...drug.preview, correctionCount: drug.corrections.length, corrections: drug.corrections, warnings: drug.warnings, errors: drug.errors })),
  });
}
