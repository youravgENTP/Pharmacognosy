import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { constituentTaxonEdges } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

const bodySchema = z.object({ parentId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success || parsed.data.parentId === id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const edges = await db.select().from(constituentTaxonEdges);
  if (reaches(edges, id, parsed.data.parentId)) return NextResponse.json({ error: "순환 구조는 만들 수 없습니다." }, { status: 409 });
  await db.insert(constituentTaxonEdges).values({ parentId: parsed.data.parentId, childId: id }).onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.delete(constituentTaxonEdges).where(and(eq(constituentTaxonEdges.parentId, parsed.data.parentId), eq(constituentTaxonEdges.childId, id)));
  return new NextResponse(null, { status: 204 });
}

function reaches(edges: { parentId: string; childId: string }[], start: string, target: string, seen = new Set<string>()): boolean {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return edges.filter((edge) => edge.parentId === start).some((edge) => reaches(edges, edge.childId, target, seen));
}
