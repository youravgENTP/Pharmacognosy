import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { normalizeEmail } from "@/lib/auth";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { user, userInvitations } from "@/lib/db/schema";

export async function GET() {
  const denied = await authorizeApi("admin"); if (denied) return denied;
  return NextResponse.json(await db.select().from(userInvitations).orderBy(desc(userInvitations.createdAt)).limit(100));
}

export async function POST(request: Request) {
  const denied = await authorizeApi("admin"); if (denied) return denied;
  const current = await getCurrentUser();
  const parsed = z.object({ email: z.string().email().max(320) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !current) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);
  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existingUser) return NextResponse.json({ error: "This email already has an account" }, { status: 409 });
  const [active] = await db.select({ id: userInvitations.id }).from(userInvitations).where(and(eq(userInvitations.email, email), isNull(userInvitations.acceptedAt), gt(userInvitations.expiresAt, new Date()))).limit(1);
  if (active) return NextResponse.json({ error: "An active invitation already exists" }, { status: 409 });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invitation] = await db.insert(userInvitations).values({ email, invitedByUserId: current.id, expiresAt }).returning();
  return NextResponse.json(invitation, { status: 201 });
}
