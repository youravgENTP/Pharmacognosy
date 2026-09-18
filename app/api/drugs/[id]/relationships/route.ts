import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { crudeDrugRelationships, crudeDrugs, relationshipTypes } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

const bodySchema = z.object({ targetId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success || parsed.data.targetId === id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const targetId = parsed.data.targetId;
  const [target] = await db.select({ id: crudeDrugs.id, catalogIndex: crudeDrugs.catalogIndex, name: crudeDrugs.koreanName }).from(crudeDrugs).where(eq(crudeDrugs.id, targetId)).limit(1);
  if (!target) return NextResponse.json({ error: "생약을 찾을 수 없습니다." }, { status: 404 });
  const [existing] = await db.select({ id: crudeDrugRelationships.id }).from(crudeDrugRelationships).where(or(and(eq(crudeDrugRelationships.sourceId, id), eq(crudeDrugRelationships.targetId, targetId)), and(eq(crudeDrugRelationships.sourceId, targetId), eq(crudeDrugRelationships.targetId, id)))).limit(1);
  if (existing) return NextResponse.json({ ...existing, catalogIndex: target.catalogIndex, name: target.name });
  let [type] = await db.select().from(relationshipTypes).where(eq(relationshipTypes.name, "연관")).limit(1);
  if (!type) [type] = await db.insert(relationshipTypes).values({ name: "연관" }).returning();
  const [created] = await db.insert(crudeDrugRelationships).values({ sourceId: id, targetId, typeId: type.id }).returning();
  return NextResponse.json({ id: created.id, catalogIndex: target.catalogIndex, name: target.name }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ relationshipId: z.string().uuid() }).safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.delete(crudeDrugRelationships).where(and(eq(crudeDrugRelationships.id, parsed.data.relationshipId), or(eq(crudeDrugRelationships.sourceId, id), eq(crudeDrugRelationships.targetId, id))));
  return new NextResponse(null, { status: 204 });
}
