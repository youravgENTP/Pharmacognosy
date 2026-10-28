import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { archiveEntries, archiveGroups, categories, crudeDrugs } from "@/lib/db/schema";

const groupSchema = z.object({ name: z.string().trim().min(1).max(120), prefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{0,7}$/), description: z.string().trim().max(500).nullable().optional() });

export async function GET() {
  const authError = await authorizeApi("user"); if (authError) return authError;
  const [groups, entries, activeDrugs] = await Promise.all([
    db.select().from(archiveGroups).orderBy(asc(archiveGroups.createdAt)),
    db.select({ id: archiveEntries.id, archiveGroupId: archiveEntries.archiveGroupId, drugId: crudeDrugs.id, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, originalIndexType: archiveEntries.originalIndexType, originalIndex: archiveEntries.originalIndex, archivedAt: archiveEntries.archivedAt, categoryId: categories.id, categoryName: categories.name, importance: crudeDrugs.importance }).from(archiveEntries).innerJoin(crudeDrugs, eq(crudeDrugs.id, archiveEntries.drugId)).leftJoin(categories, eq(categories.id, crudeDrugs.categoryId)).orderBy(asc(archiveEntries.originalIndexType), asc(archiveEntries.originalIndex)),
    db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex, categoryId: categories.id, categoryName: categories.name, importance: crudeDrugs.importance }).from(crudeDrugs).leftJoin(categories, eq(categories.id, crudeDrugs.categoryId)).leftJoin(archiveEntries, eq(archiveEntries.drugId, crudeDrugs.id)).where(and(isNull(archiveEntries.id), or(isNotNull(crudeDrugs.catalogIndex), isNotNull(crudeDrugs.referenceIndex)))).orderBy(asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)),
  ]);
  return NextResponse.json({ groups: groups.map((group) => ({ ...group, entries: entries.filter((entry) => entry.archiveGroupId === group.id) })), activeDrugs });
}

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const current = await getCurrentUser(request.headers);
  const parsed = groupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름과 영문/숫자 Prefix를 확인해 주세요." }, { status: 400 });
  try {
    const [group] = await db.insert(archiveGroups).values({ ...parsed.data, description: parsed.data.description || null, createdBy: current!.id }).returning();
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("Archive group creation failed", error);
    return NextResponse.json({ error: "같은 이름 또는 Prefix의 Archive 그룹이 이미 있습니다." }, { status: 409 });
  }
}
