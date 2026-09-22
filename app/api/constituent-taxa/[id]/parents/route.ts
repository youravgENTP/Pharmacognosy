import { authorizeApi } from "@/lib/auth/permissions";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentTaxa, constituentTaxonEdges } from "@/lib/db/schema";
import { validateParentLink, type ParentLinkError } from "@/lib/constituent-taxonomy";
import { uuidSchema } from "@/lib/validators";

const bodySchema = z.object({ parentId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const reason = await db.transaction(async (tx) => {
      // Serialize graph mutations so two concurrent, opposite links cannot both
      // pass cycle validation before either edge becomes visible.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('constituent_taxon_edges'))`);
      const nodes = await tx.select({ id: constituentTaxa.id }).from(constituentTaxa);
      const edges = await tx.select().from(constituentTaxonEdges);
      const validation = validateParentLink(new Set(nodes.map((node) => node.id)), edges, id, parsed.data.parentId);
      if (!validation) await tx.insert(constituentTaxonEdges).values({ parentId: parsed.data.parentId, childId: id }).onConflictDoNothing();
      return validation;
    });
    if (reason) return NextResponse.json({ error: taxonomyErrorMessage(reason) }, { status: reason.startsWith("missing") ? 404 : 409 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[CompoundTree] Failed to link taxonomy parent", { childId: id, parentId: parsed.data.parentId, error });
    return NextResponse.json({ error: "상위 분류를 연결하지 못했습니다. 서버 로그를 확인해주세요." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.delete(constituentTaxonEdges).where(and(eq(constituentTaxonEdges.parentId, parsed.data.parentId), eq(constituentTaxonEdges.childId, id)));
  return new NextResponse(null, { status: 204 });
}

function taxonomyErrorMessage(reason: ParentLinkError) { return reason === "missing-parent" ? "상위 분류를 찾지 못했습니다." : reason === "missing-child" ? "이 분류를 찾지 못했습니다." : reason === "self-parent" ? "항목을 자기 자신의 하위로 연결할 수 없습니다." : "하위 항목 아래로 연결하면 순환 구조가 생깁니다."; }
