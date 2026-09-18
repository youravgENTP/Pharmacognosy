import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { constituentMemberships, constituents, constituentTaxonEdges } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taxonId = searchParams.get("taxonId");
  const includeDescendants = searchParams.get("includeDescendants") !== "false";
  const query = searchParams.get("q")?.trim() ?? "";
  if (!taxonId || !uuidSchema.safeParse(taxonId).success) return NextResponse.json({ error: "Invalid taxon id" }, { status: 400 });

  const edges = includeDescendants ? await db.select().from(constituentTaxonEdges) : [];
  const taxonIds = includeDescendants ? descendantsOf(taxonId, edges) : [taxonId];
  const conditions = [inArray(constituentMemberships.taxonId, taxonIds)];
  if (query) conditions.push(ilike(constituents.name, `%${query}%`));
  const rows = await db.selectDistinct({ id: constituents.id, name: constituents.name, aliases: constituents.aliases })
    .from(constituents)
    .innerJoin(constituentMemberships, eq(constituentMemberships.constituentId, constituents.id))
    .where(and(...conditions))
    .orderBy(asc(constituents.name));
  return NextResponse.json({ taxonIds, count: rows.length, constituents: rows });
}

function descendantsOf(rootId: string, edges: { parentId: string; childId: string }[]) {
  const found = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const edge of edges) if (edge.parentId === parentId && !found.has(edge.childId)) {
      found.add(edge.childId);
      queue.push(edge.childId);
    }
  }
  return [...found];
}
