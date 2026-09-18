import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categories, crudeDrugs, families, type StudySection } from "@/lib/db/schema";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";
import { z } from "zod";

const requestSchema = z.object({ payload: pharmacognosyImportV1Schema, existingStrategy: z.enum(["merge", "skip"]) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const result = await db.transaction(async (tx) => {
    let inserted = 0, updated = 0, skipped = 0;
    for (const drug of parsed.data.payload.drugs) {
      let [category] = await tx.select().from(categories).where(eq(categories.name, drug.category)).limit(1);
      if (!category) [category] = await tx.insert(categories).values({ name: drug.category, slug: `import-${crypto.randomUUID()}` }).returning();
      let familyId: string | null = null;
      if (drug.family) {
        let [family] = await tx.select().from(families).where(eq(families.scientificName, drug.family.scientificName)).limit(1);
        if (!family) [family] = await tx.insert(families).values(drug.family).returning();
        familyId = family.id;
      }
      const [existing] = await tx.select().from(crudeDrugs).where(eq(crudeDrugs.koreanName, drug.koreanName)).limit(1);
      const sections = drug.sections.map((section) => ({ id: crypto.randomUUID(), title: section.title, items: section.items.map(addIds) })) as StudySection[];
      const values = { koreanName: drug.koreanName, latinName: drug.latinName, origin: drug.origin, scientificName: drug.scientificName, medicinalPart: drug.medicinalPart, importance: drug.importance, categoryId: category.id, familyId, sections };
      if (existing && parsed.data.existingStrategy === "skip") { skipped++; continue; }
      if (existing) { await tx.update(crudeDrugs).set({ ...values, updatedAt: new Date() }).where(eq(crudeDrugs.id, existing.id)); updated++; }
      else { await tx.insert(crudeDrugs).values(values); inserted++; }
    }
    return { inserted, updated, skipped };
  });
  return NextResponse.json(result);
}

function addIds(item: { text: string; children?: unknown[] }): { id: string; text: string; children?: ReturnType<typeof addIds>[] } {
  return { id: crypto.randomUUID(), text: item.text, ...(item.children ? { children: item.children.map((child) => addIds(child as { text: string; children?: unknown[] })) } : {}) };
}
