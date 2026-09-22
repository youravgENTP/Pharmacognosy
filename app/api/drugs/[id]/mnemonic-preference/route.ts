import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { userDrugMnemonics, userMnemonicPreferences } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers); if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params; const parsed = z.object({ preferredMnemonicUserId: z.string().nullable() }).safeParse(await request.json().catch(() => null));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const preferred = parsed.data.preferredMnemonicUserId;
  if (!preferred) { await db.delete(userMnemonicPreferences).where(and(eq(userMnemonicPreferences.userId, current.id), eq(userMnemonicPreferences.drugId, id))); return new NextResponse(null, { status: 204 }); }
  const [version] = await db.select({ userId: userDrugMnemonics.userId }).from(userDrugMnemonics).where(and(eq(userDrugMnemonics.drugId, id), eq(userDrugMnemonics.userId, preferred))).limit(1);
  if (!version) return NextResponse.json({ error: "선택한 사용자의 암기법이 존재하지 않습니다." }, { status: 409 });
  await db.insert(userMnemonicPreferences).values({ userId: current.id, drugId: id, preferredMnemonicUserId: preferred }).onConflictDoUpdate({ target: [userMnemonicPreferences.userId, userMnemonicPreferences.drugId], set: { preferredMnemonicUserId: preferred, updatedAt: new Date() } });
  return NextResponse.json({ preferredMnemonicUserId: preferred });
}
