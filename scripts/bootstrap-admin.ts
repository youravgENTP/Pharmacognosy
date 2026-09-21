import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { and, eq, gt, isNull } = await import("drizzle-orm");
  const { db, databaseClient } = await import("../lib/db");
  const { user, userInvitations, userProfiles } = await import("../lib/db/schema");
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("INITIAL_ADMIN_EMAIL is required");
  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!existingUser) {
    const [activeInvite] = await db.select({ id: userInvitations.id }).from(userInvitations).where(and(eq(userInvitations.email, email), isNull(userInvitations.acceptedAt), gt(userInvitations.expiresAt, new Date()))).limit(1);
    if (!activeInvite) await db.insert(userInvitations).values({ email, invitedByUserId: null, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    console.log(`Bootstrap invitation ready for ${email}. Sign up and verify, then run this command once more to promote the account.`);
    await databaseClient.end();
    return;
  }
  await db.insert(userProfiles).values({ userId: existingUser.id, role: "admin" }).onConflictDoUpdate({ target: userProfiles.userId, set: { role: "admin", updatedAt: new Date() } });
  console.log(`Admin role assigned to ${email}. You may now remove INITIAL_ADMIN_EMAIL.`);
  await databaseClient.end();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Admin bootstrap failed"); process.exit(1); });
