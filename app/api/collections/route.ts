import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collections, collectionMembers, crudeDrugs } from "@/lib/db/schema";
import { z } from "zod";

export async function GET() {
  const rows = await db.select({ id: collections.id, name: collections.name, description: collections.description, createdAt: collections.createdAt }).from(collections).orderBy(asc(collections.createdAt));
  const members = await db.select({ collectionId: collectionMembers.collectionId, id: crudeDrugs.id, koreanName: crudeDrugs.koreanName }).from(collectionMembers).innerJoin(crudeDrugs, eq(collectionMembers.crudeDrugId, crudeDrugs.id));
  return NextResponse.json(rows.map((row) => ({ ...row, members: members.filter((m) => m.collectionId === row.id) })));
}

export async function POST(request: Request) {
  const parsed = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).optional() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [created] = await db.insert(collections).values(parsed.data).returning();
  return NextResponse.json(created, { status: 201 });
}

