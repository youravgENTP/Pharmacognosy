import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { authorizeApi } from "@/lib/auth/permissions";

const resetSchema = z.object({
  userId: z.string().trim().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const denied = await authorizeApi("admin");
  if (denied) return denied;

  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password reset" }, { status: 400 });

  const context = await auth.$context;
  const target = await context.internalAdapter.findUserById(parsed.data.userId);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const password = await context.password.hash(parsed.data.newPassword);
  const credential = await context.internalAdapter.findCredentialAccount(target.id);
  if (credential) await context.internalAdapter.updatePassword(target.id, password);
  else await context.internalAdapter.createAccount({ userId: target.id, providerId: "credential", accountId: target.id, password });
  await context.internalAdapter.deleteUserSessions(target.id);

  return NextResponse.json({ success: true });
}
