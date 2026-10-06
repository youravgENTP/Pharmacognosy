import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { crudeDrugs, fieldDefinitions, user, userDrugMnemonics, userProfiles } from "@/lib/db/schema";
import { assignmentForUser } from "@/lib/mnemonic-assignments";
import { calculateMnemonicProgress } from "@/lib/mnemonic-progress";

export async function GET() {
  const denied = await authorizeApi("admin"); if (denied) return denied;
  const [users, drugs, mnemonics, fields] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, role: userProfiles.role }).from(user).innerJoin(userProfiles, eq(userProfiles.userId, user.id)).orderBy(asc(user.name)),
    db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, sections: crudeDrugs.sections }).from(crudeDrugs),
    db.select({ drugId: userDrugMnemonics.drugId, userId: userDrugMnemonics.userId, items: userDrugMnemonics.items, blocks: userDrugMnemonics.blocks }).from(userDrugMnemonics),
    db.select({ id: fieldDefinitions.id, name: fieldDefinitions.name }).from(fieldDefinitions),
  ]);
  const fieldNames = new Map(fields.map((field) => [field.id, field.name]));
  return NextResponse.json(users.map((listedUser) => {
    const assignment = assignmentForUser(listedUser.name);
    const progress = assignment ? calculateMnemonicProgress(assignment, drugs, mnemonics.filter((mnemonic) => mnemonic.userId === listedUser.id), fieldNames) : null;
    return { ...listedUser, progress };
  }));
}

export async function PATCH(request: Request) {
  const denied = await authorizeApi("admin"); if (denied) return denied;
  const current = await getCurrentUser();
  const parsed = z.object({ userId: z.string().min(1), role: z.enum(["admin", "editor"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid role update" }, { status: 400 });
  if (parsed.data.userId === current?.id) return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  const [updated] = await db.update(userProfiles).set({ role: parsed.data.role, updatedAt: new Date() }).where(eq(userProfiles.userId, parsed.data.userId)).returning({ userId: userProfiles.userId, role: userProfiles.role });
  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(updated);
}
