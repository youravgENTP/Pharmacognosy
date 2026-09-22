import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { user, userProfiles } from "@/lib/db/schema";

export async function GET() {
  const denied = await authorizeApi("admin"); if (denied) return denied;
  const users = await db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, role: userProfiles.role }).from(user).innerJoin(userProfiles, eq(userProfiles.userId, user.id)).orderBy(asc(user.name));
  return NextResponse.json(users);
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
