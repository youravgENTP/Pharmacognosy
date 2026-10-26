import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { categories, crudeDrugs, families, fieldDefinitions, user, userDrugMnemonics } from "@/lib/db/schema";
import { prepareImport } from "@/lib/import-pipeline";
import { normalizeKey } from "@/lib/import-normalization";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";

export async function POST(request: Request) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "editor" && current.role !== "admin") return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const parsed = pharmacognosyImportV1Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false, errors: parsed.error.issues }, { status: 400 });
  const [fields, existingDrugs, familyRows, mnemonicRows, categoryRows, userRows] = await Promise.all([
    db.select().from(fieldDefinitions), db.select().from(crudeDrugs), db.select().from(families),
    db.select({ drugId: userDrugMnemonics.drugId, userId: userDrugMnemonics.userId, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks }).from(userDrugMnemonics),
    db.select().from(categories),
    db.select({ id: user.id, name: user.name }).from(user),
  ]);
  const previewFields = fields.some((field) => field.active && normalizeKey(field.name) === normalizeKey("기타")) ? fields : [...fields.filter((field) => normalizeKey(field.name) !== normalizeKey("기타")), { id: "pending-other-field", name: "기타", kind: "custom" as const, inputMode: "hierarchy4" as const, position: Math.max(70, ...fields.map((field) => field.position)) + 10, active: true, createdAt: new Date(), updatedAt: new Date() }];
  const prepared = prepareImport(parsed.data, { fields: previewFields, existingDrugs, categories: categoryRows, families: familyRows, users: userRows, currentUser: { id: current.id, name: current.name }, mnemonicVersions: mnemonicRows });
  const used = new Set(existingDrugs.flatMap((drug) => drug.catalogIndex == null ? [] : [drug.catalogIndex]));
  const allocations = new Map<number, number>();
  prepared.drugs.forEach((drug, index) => {
    if (drug.existing) return;
    let value = drug.input.catalogIndex;
    if (value === undefined) { value = 1; while (used.has(value)) value++; }
    if (used.has(value)) drug.errors.push({ code: "catalog-index-conflict", field: "catalogIndex", message: `활성 인덱스 ${value}은(는) 이미 사용 중입니다.` });
    else { used.add(value); allocations.set(index, value); }
  });
  return NextResponse.json({
    valid: true,
    canCommit: prepared.drugs.every((drug) => !drug.errors.length),
    summary: { total: prepared.drugs.length, new: prepared.drugs.filter((drug) => !drug.existing).length, existing: prepared.drugs.filter((drug) => drug.existing).length, errors: prepared.drugs.reduce((sum, drug) => sum + drug.errors.length, 0), warnings: prepared.drugs.reduce((sum, drug) => sum + drug.warnings.length, 0) },
    drugs: prepared.drugs.map((drug, index) => ({ koreanName: drug.input.koreanName, category: drug.input.category, exists: Boolean(drug.existing), assignedCatalogIndex: allocations.get(index) ?? drug.existing?.catalogIndex ?? null, ...drug.preview, correctionCount: drug.corrections.length, corrections: drug.corrections, warnings: drug.warnings, errors: drug.errors })),
  });
}
