import { authorizeApi } from "@/lib/auth/permissions";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentMedia, constituentMemberships, constituents, constituentTaxa, constituentTaxonEdges, constituentTaxonMedia } from "@/lib/db/schema";
import { validateParentLink, type ParentLinkError } from "@/lib/constituent-taxonomy";

export async function GET() { const authError = await authorizeApi("user"); if (authError) return authError;
  const [nodes, constituentRows, memberships, taxonMedia, compoundMedia] = await Promise.all([
    db.select().from(constituentTaxa).where(and(ne(constituentTaxa.kind, "compound"), eq(constituentTaxa.hidden, false))).orderBy(asc(constituentTaxa.position), asc(constituentTaxa.name)),
    db.select().from(constituents).orderBy(asc(constituents.name)),
    db.select().from(constituentMemberships),
    db.select().from(constituentTaxonMedia).orderBy(asc(constituentTaxonMedia.position), asc(constituentTaxonMedia.createdAt)),
    db.select().from(constituentMedia).orderBy(asc(constituentMedia.position), asc(constituentMedia.createdAt)),
  ]);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = (await db.select().from(constituentTaxonEdges).orderBy(asc(constituentTaxonEdges.position))).filter((edge) => visibleIds.has(edge.parentId) && visibleIds.has(edge.childId));
  return NextResponse.json({ nodes, edges, constituents: constituentRows, memberships: memberships.filter((row) => visibleIds.has(row.taxonId)), taxonMedia, constituentMedia: compoundMedia });
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
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('constituent_taxon_edges'))`);
      const [existing] = await tx.select().from(constituentTaxa).where(and(eq(constituentTaxa.name, values.name), eq(constituentTaxa.kind, values.kind))).limit(1);
      const [parent] = parentId ? await tx.select({ id: constituentTaxa.id }).from(constituentTaxa).where(eq(constituentTaxa.id, parentId)).limit(1) : [];
      if (parentId && !parent) throw new TaxonomyRequestError("missing-parent");

      // Taxonomy nodes are globally unique by name + kind and may have several
      // parents. Reuse an existing node instead of treating a deeper link as a
      // duplicate-node failure.
      if (existing) {
        if (parentId) {
          const edges = await tx.select().from(constituentTaxonEdges);
          const error = validateParentLink(new Set([existing.id, parentId]), edges, existing.id, parentId);
          if (error) throw new TaxonomyRequestError(error);
          await tx.insert(constituentTaxonEdges).values({ parentId, childId: existing.id }).onConflictDoNothing();
        }
        return { row: existing, reused: true };
      }

      const [created] = await tx.insert(constituentTaxa).values(values).returning();
      if (parentId) await tx.insert(constituentTaxonEdges).values({ parentId, childId: created.id });
      return { row: created, reused: false };
    });
    return NextResponse.json(result.row, { status: result.reused ? 200 : 201 });
  } catch (error) {
    if (error instanceof TaxonomyRequestError) return NextResponse.json({ error: taxonomyErrorMessage(error.reason) }, { status: error.reason.startsWith("missing") ? 404 : 409 });
    console.error("[CompoundTree] Failed to create or link taxonomy node", { parentId, name: values.name, kind: values.kind, error });
    return NextResponse.json({ error: "분류를 추가하지 못했습니다. 서버 로그를 확인해주세요." }, { status: 500 });
  }
}

class TaxonomyRequestError extends Error { constructor(readonly reason: ParentLinkError) { super(reason); } }
function taxonomyErrorMessage(reason: ParentLinkError) { return reason === "missing-parent" ? "상위 분류를 찾지 못했습니다." : reason === "missing-child" ? "하위 분류를 찾지 못했습니다." : reason === "self-parent" ? "항목을 자기 자신의 하위로 연결할 수 없습니다." : "하위 항목 아래로 연결하면 순환 구조가 생깁니다."; }
