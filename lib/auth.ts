import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { and, eq, gt, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendAuthEmail } from "@/lib/auth/email";

export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function isAuthEmailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM); }
export function isDevelopmentEmailBypass() { return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS_EMAIL === "true"; }

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !isDevelopmentEmailBypass(),
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => { after(async () => { await sendAuthEmail({ to: user.email, subject: "Reset your Herb Overflow password", heading: "Reset your password", action: "Reset password", url, expires: "in 1 hour" }).catch(() => undefined); }); },
    onPasswordReset: async ({ user }) => {
      await db.delete(schema.session).where(eq(schema.session.userId, user.id));
    },
  },
  emailVerification: {
    sendOnSignUp: !isDevelopmentEmailBypass(),
    sendOnSignIn: !isDevelopmentEmailBypass(),
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => { after(async () => { await sendAuthEmail({ to: user.email, subject: "Verify your Herb Overflow email", heading: "Verify your email", action: "Verify email", url, expires: "in 24 hours" }).catch(() => undefined); }); },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      if (!isDevelopmentEmailBypass() && !isAuthEmailConfigured()) throw new APIError("SERVICE_UNAVAILABLE", { message: "Authentication email is not configured." });
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
