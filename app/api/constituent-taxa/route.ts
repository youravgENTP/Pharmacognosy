import { authorizeApi } from "@/lib/auth/permissions";
import { and, asc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentTaxa, constituentTaxonEdges } from "@/lib/db/schema";

export async function GET() { const authError = await authorizeApi("user"); if (authError) return authError;
  const nodes = await db.select().from(constituentTaxa).where(and(ne(constituentTaxa.kind, "compound"), eq(constituentTaxa.hidden, false))).orderBy(asc(constituentTaxa.position), asc(constituentTaxa.name));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = (await db.select().from(constituentTaxonEdges).orderBy(asc(constituentTaxonEdges.position))).filter((edge) => visibleIds.has(edge.parentId) && visibleIds.has(edge.childId));
  return NextResponse.json({ nodes, edges });
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["pathway", "class", "subclass"]).default("class"),
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
