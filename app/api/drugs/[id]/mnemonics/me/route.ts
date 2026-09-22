import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, userDrugMnemonics } from "@/lib/db/schema";
import { mnemonicPayloadSchema, uuidSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = mnemonicPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [drug] = await db.select({ id: crudeDrugs.id }).from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1);
  if (!drug) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [saved] = await db.insert(userDrugMnemonics).values({ drugId: id, userId: current.id, ...parsed.data }).onConflictDoUpdate({
    target: [userDrugMnemonics.drugId, userDrugMnemonics.userId],
    set: { ...parsed.data, updatedAt: new Date() },
  }).returning();
  return NextResponse.json({ ...saved, userName: current.name, isMine: true });
}
