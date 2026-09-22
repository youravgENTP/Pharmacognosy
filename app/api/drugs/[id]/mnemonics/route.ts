import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, user, userDrugMnemonics, userMnemonicPreferences } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [drug] = await db.select({ id: crudeDrugs.id }).from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1);
  if (!drug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [rows, [preference]] = await Promise.all([db.select({
    id: userDrugMnemonics.id,
    userId: userDrugMnemonics.userId,
    userName: user.name,
    items: userDrugMnemonics.items,
    blocks: userDrugMnemonics.blocks,
    updatedAt: userDrugMnemonics.updatedAt,
  }).from(userDrugMnemonics).innerJoin(user, eq(user.id, userDrugMnemonics.userId)).where(eq(userDrugMnemonics.drugId, id)).orderBy(desc(userDrugMnemonics.updatedAt)), db.select({ preferredMnemonicUserId: userMnemonicPreferences.preferredMnemonicUserId }).from(userMnemonicPreferences).where(and(eq(userMnemonicPreferences.userId, current.id), eq(userMnemonicPreferences.drugId, id))).limit(1)]);
  const validPreference = rows.some((row) => row.userId === preference?.preferredMnemonicUserId) ? preference?.preferredMnemonicUserId : null;
  return NextResponse.json({ currentUserId: current.id, preferredMnemonicUserId: validPreference, versions: rows.map((row) => ({ ...row, isMine: row.userId === current.id })) });
}
