import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildDataCardImport } from "@/lib/data-card-import";
import { db } from "@/lib/db";
import { categories, crudeDrugIdentityTerms, crudeDrugRelationships, crudeDrugs, drugIdentityTerms, families, fieldDefinitions, relationshipTypes, userDrugMnemonics } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [drug] = await db.select({
    koreanName: crudeDrugs.koreanName,
    latinName: crudeDrugs.latinName,
    origin: crudeDrugs.origin,
    origins: crudeDrugs.origins,
    scientificName: crudeDrugs.scientificName,
    medicinalPart: crudeDrugs.medicinalPart,
    importance: crudeDrugs.importance,
    sections: crudeDrugs.sections,
    category: categories.name,
    familyKoreanName: families.koreanName,
    familyScientificName: families.scientificName,
  }).from(crudeDrugs)
    .leftJoin(categories, eq(categories.id, crudeDrugs.categoryId))
    .leftJoin(families, eq(families.id, crudeDrugs.familyId))
    .where(eq(crudeDrugs.id, id))
    .limit(1);
  if (!drug) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [fields, relationships, drugNames, identityRows, mnemonic] = await Promise.all([
    db.select({ id: fieldDefinitions.id, name: fieldDefinitions.name }).from(fieldDefinitions),
    db.select({ sourceId: crudeDrugRelationships.sourceId, targetId: crudeDrugRelationships.targetId, type: relationshipTypes.name, notes: crudeDrugRelationships.notes })
      .from(crudeDrugRelationships)
      .innerJoin(relationshipTypes, eq(relationshipTypes.id, crudeDrugRelationships.typeId))
      .where(or(eq(crudeDrugRelationships.sourceId, id), eq(crudeDrugRelationships.targetId, id))),
    db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName }).from(crudeDrugs),
    db.select({ name: drugIdentityTerms.name }).from(crudeDrugIdentityTerms)
      .innerJoin(drugIdentityTerms, eq(drugIdentityTerms.id, crudeDrugIdentityTerms.termId))
      .where(eq(crudeDrugIdentityTerms.crudeDrugId, id))
      .orderBy(crudeDrugIdentityTerms.position),
    db.select({ items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks }).from(userDrugMnemonics)
      .where(and(eq(userDrugMnemonics.drugId, id), eq(userDrugMnemonics.userId, current.id)))
      .then((rows) => rows[0]),
  ]);
  const names = new Map(drugNames.map((row) => [row.id, row.koreanName]));
  const payload = buildDataCardImport({
    ...drug,
    family: drug.familyScientificName ? { koreanName: drug.familyKoreanName ?? drug.familyScientificName, scientificName: drug.familyScientificName } : null,
    fieldNames: new Map(fields.map((field) => [field.id, field.name])),
    relationships: relationships.map((relationship) => ({
      targetKoreanName: names.get(relationship.sourceId === id ? relationship.targetId : relationship.sourceId) ?? "",
      type: relationship.type,
      notes: relationship.notes,
    })).filter((relationship) => relationship.targetKoreanName),
    identityTerms: identityRows.map((row) => row.name),
    mnemonic: mnemonic ? { items: mnemonic.items, blocks: mnemonic.blocks } : { items: [], blocks: [] },
  });

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const safeName = drug.koreanName.normalize("NFC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "data-card";
  const filename = `${safeName}-${timestamp}-${crypto.randomUUID().slice(0, 8)}.json`;
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-card-${timestamp}.json"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Download-Filename": encodeURIComponent(filename),
      "Cache-Control": "no-store",
    },
  });
}
