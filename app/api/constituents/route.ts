import { authorizeApi } from "@/lib/auth/permissions";
import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentMemberships, constituents, constituentTaxa, constituentTaxonEdges } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function GET(request: Request) { const authError = await authorizeApi("user"); if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const taxonId = searchParams.get("taxonId");
  const includeDescendants = searchParams.get("includeDescendants") !== "false";
  const query = searchParams.get("q")?.trim() ?? "";
  if (taxonId && !uuidSchema.safeParse(taxonId).success) return NextResponse.json({ error: "Invalid taxon id" }, { status: 400 });

  const edges = taxonId && includeDescendants ? await db.select().from(constituentTaxonEdges) : [];
  const taxonIds = taxonId ? (includeDescendants ? descendantsOf(taxonId, edges) : [taxonId]) : [];
  let rows = taxonId
    ? await db.selectDistinct({ id: constituents.id, name: constituents.name, aliases: constituents.aliases }).from(constituents).innerJoin(constituentMemberships, eq(constituentMemberships.constituentId, constituents.id)).where(inArray(constituentMemberships.taxonId, taxonIds)).orderBy(asc(constituents.name))
    : await db.select({ id: constituents.id, name: constituents.name, aliases: constituents.aliases }).from(constituents).orderBy(asc(constituents.name));
  if (query) { const needle = query.toLocaleLowerCase(); rows = rows.filter((row) => [row.name, ...row.aliases].some((value) => value.toLocaleLowerCase().includes(needle))); }
  return NextResponse.json({ taxonIds, count: rows.length, constituents: rows });
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = z.object({ name: z.string().trim().min(1).max(160), aliases: z.array(z.string().trim().min(1).max(160)).max(40).optional(), taxonId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "성분명과 상위 분류가 필요합니다." }, { status: 400 });
  const [taxon] = await db.select({ id: constituentTaxa.id }).from(constituentTaxa).where(eq(constituentTaxa.id, parsed.data.taxonId)).limit(1);
  if (!taxon) return NextResponse.json({ error: "연결할 Compound Tree 분류를 찾지 못했습니다." }, { status: 404 });
  const result = await db.transaction(async (tx) => {
    let [constituent] = await tx.select().from(constituents).where(eq(constituents.name, parsed.data.name)).limit(1);
    let created = false;
    if (!constituent) { [constituent] = await tx.insert(constituents).values({ name: parsed.data.name, aliases: parsed.data.aliases ?? [] }).returning(); created = true; }
    await tx.insert(constituentMemberships).values({ constituentId: constituent.id, taxonId: taxon.id }).onConflictDoNothing();
    return { constituent, created };
  });
  return NextResponse.json({ ...result.constituent, taxonId: taxon.id, created: result.created }, { status: result.created ? 201 : 200 });
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
