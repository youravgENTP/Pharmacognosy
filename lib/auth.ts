import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const rawEmail = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      const email = normalizeEmail(rawEmail);
      const [invitation] = await db.select({ id: schema.userInvitations.id }).from(schema.userInvitations).where(and(eq(schema.userInvitations.email, email), isNull(schema.userInvitations.acceptedAt), gt(schema.userInvitations.expiresAt, new Date()))).limit(1);
      if (!invitation) throw new APIError("FORBIDDEN", { message: "A valid invitation is required to sign up." });
      return { context: { ...ctx, body: { ...ctx.body, email } } };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const email = normalizeEmail(createdUser.email);
          await db.transaction(async (tx) => {
            await tx.insert(schema.userProfiles).values({ userId: createdUser.id, role: "editor" }).onConflictDoNothing();
            await tx.update(schema.userInvitations).set({ acceptedAt: new Date() }).where(and(eq(schema.userInvitations.email, email), isNull(schema.userInvitations.acceptedAt), gt(schema.userInvitations.expiresAt, new Date())));
          });
        },
      },
    },
  },
});
