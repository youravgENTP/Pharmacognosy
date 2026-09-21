import { authorizeApi } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { families } from "@/lib/db/schema";
import { getFamilyExplorerData } from "@/lib/data/family";
import { familyCreateSchema } from "@/lib/validators";

export async function GET() { const authError = await authorizeApi("user"); if (authError) return authError;
  return NextResponse.json(await getFamilyExplorerData());
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = familyCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const [created] = await db.insert(families).values(parsed.data).returning();
    return NextResponse.json({ ...created, drugs: [] }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return NextResponse.json({ error: "이미 등록된 학명입니다." }, { status: 409 });
    throw error;
  }
}
