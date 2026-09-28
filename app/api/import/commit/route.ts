import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { categories, crudeDrugIdentityTerms, crudeDrugRelationships, crudeDrugs, drugIdentityTerms, families, fieldDefinitions, relationshipTypes, userDrugMnemonics, userMnemonicPreferences } from "@/lib/db/schema";
import { importItemsWithIds, mergeImportedSections, prepareImport, scalarMergePatch } from "@/lib/import-pipeline";
import { normalizeKey } from "@/lib/import-normalization";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";
import { z } from "zod";

const requestSchema = z.object({ payload: pharmacognosyImportV1Schema, existingStrategy: z.enum(["merge", "skip"]) });

class ImportBlockedError extends Error { constructor(readonly errors: { koreanName: string; errors: unknown[] }[]) { super("Import validation failed"); } }

export async function POST(request: Request) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "editor" && current.role !== "admin") return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const result = await db.transaction(async (tx) => {
      let [fallback] = await tx.select().from(fieldDefinitions).where(eq(fieldDefinitions.name, "기타")).limit(1);
      if (!fallback) {
        const [last] = await tx.select({ position: fieldDefinitions.position }).from(fieldDefinitions).orderBy(desc(fieldDefinitions.position)).limit(1);
        [fallback] = await tx.insert(fieldDefinitions).values({ name: "기타", kind: "custom", inputMode: "hierarchy4", position: (last?.position ?? 70) + 10, active: true }).returning();
      } else if (!fallback.active) [fallback] = await tx.update(fieldDefinitions).set({ active: true, updatedAt: new Date() }).where(eq(fieldDefinitions.id, fallback.id)).returning();

      const [fields, existingDrugs, familyRows, mnemonicRows, categoryRows] = await Promise.all([
        tx.select().from(fieldDefinitions), tx.select().from(crudeDrugs), tx.select().from(families),
        tx.select({ drugId: userDrugMnemonics.drugId }).from(userDrugMnemonics).where(eq(userDrugMnemonics.userId, current.id)), tx.select().from(categories),
      ]);
      const prepared = prepareImport(parsed.data.payload, { fields, existingDrugs, categories: categoryRows, families: familyRows, mnemonicDrugIds: new Set(mnemonicRows.map((row) => row.drugId)) });
      if (!prepared.canCommit) throw new ImportBlockedError(prepared.drugs.filter((drug) => drug.errors.length).map((drug) => ({ koreanName: drug.input.koreanName, errors: drug.errors })));

      const categoryByName = new Map(categoryRows.map((category) => [normalizeKey(category.name), category]));
      const familyByName = new Map(familyRows.map((family) => [normalizeKey(family.scientificName), family]));
      const drugByName = new Map(existingDrugs.map((drug) => [normalizeKey(drug.koreanName), drug]));
      const applied: { prepared: typeof prepared.drugs[number]; drugId: string }[] = [];
      let inserted = 0, updated = 0, skipped = 0;

      for (const drug of prepared.drugs) {
        const existing = drug.existing;
        if (existing && parsed.data.existingStrategy === "skip") { skipped++; continue; }
        let category = drug.input.category ? categoryByName.get(normalizeKey(drug.input.category)) : undefined;
        if (drug.input.category && !category) {
          [category] = await tx.insert(categories).values({ name: drug.input.category, slug: `import-${crypto.randomUUID()}`, position: categoryByName.size + 1 }).returning();
          categoryByName.set(normalizeKey(category.name), category);
        }
        let familyId: string | null | undefined;
        if (drug.input.family) {
          let family = familyByName.get(normalizeKey(drug.input.family.scientificName));
          if (!family) {
            [family] = await tx.insert(families).values({ scientificName: drug.input.family.scientificName, koreanName: drug.input.family.koreanName ?? drug.input.family.scientificName }).returning();
            familyByName.set(normalizeKey(family.scientificName), family);
          }
          familyId = family.id;
        }
        const sections = mergeImportedSections(existing?.sections ?? [], drug.sections, fields, Boolean(drug.input.mnemonic));
        const scalars = scalarMergePatch(drug.input, { categoryId: category?.id, familyId });
        let saved: typeof existingDrugs[number];
        if (existing) {
          [saved] = await tx.update(crudeDrugs).set({ ...scalars, ...(Object.hasOwn(drug.input, "sections") || drug.input.mnemonic ? { sections } : {}), updatedAt: new Date() }).where(eq(crudeDrugs.id, existing.id)).returning();
          updated++;
        } else {
          [saved] = await tx.insert(crudeDrugs).values({ koreanName: drug.input.koreanName, categoryId: category!.id, importance: drug.input.importance ?? "중간", sections, ...(Object.hasOwn(drug.input, "latinName") ? { latinName: drug.input.latinName } : {}), ...(Object.hasOwn(drug.input, "origin") ? { origin: drug.input.origin } : {}), ...(Object.hasOwn(drug.input, "origins") ? { origins: drug.input.origins } : {}), ...(Object.hasOwn(drug.input, "scientificName") ? { scientificName: drug.input.scientificName } : {}), ...(Object.hasOwn(drug.input, "medicinalPart") ? { medicinalPart: drug.input.medicinalPart } : {}), ...(drug.input.family ? { familyId: familyId ?? null } : {}) }).returning();
          inserted++;
        }
        drugByName.set(normalizeKey(saved.koreanName), saved);
        applied.push({ prepared: drug, drugId: saved.id });
      }

      const [existingRelationships, existingTypes] = await Promise.all([tx.select().from(crudeDrugRelationships), tx.select().from(relationshipTypes)]);
      const typeByName = new Map(existingTypes.map((type) => [normalizeKey(type.name), type]));
      const pairKey = (left: string, right: string) => [left, right].sort().join(":");
      const relationshipByPair = new Map(existingRelationships.map((relationship) => [pairKey(relationship.sourceId, relationship.targetId), relationship]));
      let relationshipsUpserted = 0, relationshipsSkipped = 0;
      for (const { prepared: drug, drugId } of applied) for (const relationship of drug.relationships) {
        const target = drugByName.get(normalizeKey(relationship.targetKoreanName));
        if (!relationship.resolvable || !target) { relationshipsSkipped++; continue; }
        let type = typeByName.get(normalizeKey(relationship.type));
        if (!type) { [type] = await tx.insert(relationshipTypes).values({ name: relationship.type }).returning(); typeByName.set(normalizeKey(type.name), type); }
        const key = pairKey(drugId, target.id);
        const existing = relationshipByPair.get(key);
        if (existing) {
          await tx.update(crudeDrugRelationships).set({ typeId: type.id, ...(Object.hasOwn(relationship, "notes") ? { notes: relationship.notes } : {}) }).where(eq(crudeDrugRelationships.id, existing.id));
        } else {
          const [created] = await tx.insert(crudeDrugRelationships).values({ sourceId: drugId, targetId: target.id, typeId: type.id, notes: relationship.notes }).returning();
          relationshipByPair.set(key, created);
        }
        relationshipsUpserted++;
      }

      const identityRows = await tx.select().from(drugIdentityTerms);
      const identityByName = new Map(identityRows.map((term) => [normalizeKey(term.name), term]));
      let mnemonicsUpserted = 0;
      for (const { prepared: drug, drugId } of applied) {
        if (drug.input.identityTerms) {
          await tx.delete(crudeDrugIdentityTerms).where(eq(crudeDrugIdentityTerms.crudeDrugId, drugId));
          for (const [position, name] of drug.input.identityTerms.entries()) {
            let term = identityByName.get(normalizeKey(name));
            if (!term) { [term] = await tx.insert(drugIdentityTerms).values({ name }).returning(); identityByName.set(normalizeKey(term.name), term); }
            await tx.insert(crudeDrugIdentityTerms).values({ crudeDrugId: drugId, termId: term.id, position }).onConflictDoNothing();
          }
        }
        if (drug.input.mnemonic) {
          const items = importItemsWithIds(drug.input.mnemonic.items);
          await tx.insert(userDrugMnemonics).values({ drugId, userId: current.id, items, blocks: [] }).onConflictDoUpdate({ target: [userDrugMnemonics.drugId, userDrugMnemonics.userId], set: { items, blocks: [], updatedAt: new Date() } });
          await tx.insert(userMnemonicPreferences).values({ drugId, userId: current.id, preferredMnemonicUserId: current.id }).onConflictDoUpdate({ target: [userMnemonicPreferences.userId, userMnemonicPreferences.drugId], set: { preferredMnemonicUserId: current.id, updatedAt: new Date() } });
          mnemonicsUpserted++;
        }
      }
      return { inserted, updated, skipped, relationshipsUpserted, relationshipsSkipped, mnemonicsUpserted };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportBlockedError) return NextResponse.json({ error: "가져오기를 막는 검증 오류가 있습니다.", blockingErrors: error.errors }, { status: 409 });
    throw error;
  }
}
