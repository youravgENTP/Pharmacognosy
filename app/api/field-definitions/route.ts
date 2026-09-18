import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { fieldDefinitions } from "@/lib/db/schema";

const inputModeSchema = z.enum(["hierarchy4", "hierarchy3", "text"]);

export async function GET() {
  const fields = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.active, true)).orderBy(asc(fieldDefinitions.kind), asc(fieldDefinitions.position), asc(fieldDefinitions.name));
  return NextResponse.json(fields);
}

export async function POST(request: Request) {
  const parsed = z.object({ name: z.string().trim().min(1).max(100), inputMode: inputModeSchema }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "필드 이름을 입력하세요." }, { status: 400 });
  const [existing] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.name, parsed.data.name)).limit(1);
  if (existing) {
    if (!existing.active) {
      const [restored] = await db.update(fieldDefinitions).set({ active: true, inputMode: parsed.data.inputMode, updatedAt: new Date() }).where(eq(fieldDefinitions.id, existing.id)).returning();
      return NextResponse.json(restored, { status: 201 });
    }
    return NextResponse.json({ error: "이미 존재하는 필드입니다." }, { status: 409 });
  }
  const [last] = await db.select({ position: fieldDefinitions.position }).from(fieldDefinitions).where(eq(fieldDefinitions.kind, "custom")).orderBy(desc(fieldDefinitions.position)).limit(1);
  const [created] = await db.insert(fieldDefinitions).values({ name: parsed.data.name, inputMode: parsed.data.inputMode, kind: "custom", position: (last?.position ?? 99) + 1 }).returning();
  return NextResponse.json(created, { status: 201 });
}
