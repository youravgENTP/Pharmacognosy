import { authorizeApi } from "@/lib/auth/permissions";
import { asc, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { drugIdentityTerms } from "@/lib/db/schema";

export async function GET(request: Request) { const authError = await authorizeApi("user"); if (authError) return authError;
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const rows = query
    ? await db.select().from(drugIdentityTerms).where(ilike(drugIdentityTerms.name, `%${query}%`)).orderBy(asc(drugIdentityTerms.name)).limit(30)
    : await db.select().from(drugIdentityTerms).orderBy(asc(drugIdentityTerms.name)).limit(12);
  const needle = query.toLocaleLowerCase();
  return NextResponse.json(rows.sort((a, b) => Number(!a.name.toLocaleLowerCase().startsWith(needle)) - Number(!b.name.toLocaleLowerCase().startsWith(needle)) || a.name.localeCompare(b.name, "ko")).slice(0, 10));
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "용어를 입력하세요." }, { status: 400 });
  const [existing] = await db.select().from(drugIdentityTerms).where(ilike(drugIdentityTerms.name, parsed.data.name)).limit(1);
  if (existing) return NextResponse.json(existing);
  try { const [created] = await db.insert(drugIdentityTerms).values({ name: parsed.data.name }).returning(); return NextResponse.json(created, { status: 201 }); }
  catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "23505") { const [row] = await db.select().from(drugIdentityTerms).where(ilike(drugIdentityTerms.name, parsed.data.name)).limit(1); return NextResponse.json(row); } throw error; }
}
