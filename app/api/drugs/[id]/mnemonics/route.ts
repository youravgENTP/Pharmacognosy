import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, user, userDrugMnemonics } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [drug] = await db.select({ id: crudeDrugs.id }).from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1);
  if (!drug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db.select({
    id: userDrugMnemonics.id,
    userId: userDrugMnemonics.userId,
    userName: user.name,
    items: userDrugMnemonics.items,
    blocks: userDrugMnemonics.blocks,
    updatedAt: userDrugMnemonics.updatedAt,
  }).from(userDrugMnemonics).innerJoin(user, eq(user.id, userDrugMnemonics.userId)).where(eq(userDrugMnemonics.drugId, id)).orderBy(desc(userDrugMnemonics.updatedAt));
  return NextResponse.json({ currentUserId: current.id, versions: rows.map((row) => ({ ...row, isMine: row.userId === current.id })) });
}
