import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, crudeDrugs, fieldDefinitions, type StudySection } from "@/lib/db/schema";

export const REFERENCE_CATEGORY = { name: "시험범위 외 참고류", slug: "reference" } as const;

export async function createReferenceDrug(koreanName: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(20360919)`);
    const [existing] = await tx.select().from(crudeDrugs).where(eq(crudeDrugs.koreanName, koreanName)).limit(1);
    if (existing) return { drug: existing, created: false };
    let [category] = await tx.select().from(categories).where(eq(categories.slug, REFERENCE_CATEGORY.slug)).limit(1);
    if (!category) [category] = await tx.insert(categories).values({ ...REFERENCE_CATEGORY, position: 99 }).returning();
    const [last] = await tx.select({ value: crudeDrugs.referenceIndex }).from(crudeDrugs).where(and(eq(crudeDrugs.categoryId, category.id), sql`${crudeDrugs.referenceIndex} is not null`)).orderBy(desc(crudeDrugs.referenceIndex)).limit(1);
    const definitions = await tx.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.kind, "default"), eq(fieldDefinitions.active, true))).orderBy(asc(fieldDefinitions.position));
    const sections: StudySection[] = definitions.map((field) => ({ id: crypto.randomUUID(), fieldDefinitionId: field.id, title: field.name, items: [] }));
    const [drug] = await tx.insert(crudeDrugs).values({ koreanName, referenceIndex: (last?.value ?? 0) + 1, categoryId: category.id, importance: "비중요", sections }).returning();
    return { drug, created: true };
  });
}
