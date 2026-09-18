import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentTaxa, constituentTaxonEdges } from "@/lib/db/schema";

export async function GET() {
  const [nodes, edges] = await Promise.all([
    db.select().from(constituentTaxa).orderBy(asc(constituentTaxa.position), asc(constituentTaxa.name)),
    db.select().from(constituentTaxonEdges).orderBy(asc(constituentTaxonEdges.position)),
  ]);
  return NextResponse.json({ nodes, edges });
}

export async function POST(request: Request) {
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["pathway", "class", "subclass", "compound"]).default("class"),
    description: z.string().max(1000).optional(),
    parentId: z.string().uuid().optional(),
  }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { parentId, ...values } = parsed.data;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(constituentTaxa).values(values).returning();
    if (parentId) await tx.insert(constituentTaxonEdges).values({ parentId, childId: created.id });
    return created;
  });
  return NextResponse.json(row, { status: 201 });
}

