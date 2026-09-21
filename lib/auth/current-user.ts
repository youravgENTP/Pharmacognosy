import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles, type UserRole } from "@/lib/db/schema";

export type CurrentUser = { id: string; name: string; email: string; emailVerified: boolean; image?: string | null; role: UserRole };

export async function getCurrentUser(requestHeaders?: Headers): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders ?? await headers() });
  if (!session?.user?.emailVerified) return null;
  const [profile] = await db.select({ role: userProfiles.role }).from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1);
  if (!profile) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: true, image: session.user.image, role: profile.role };
}

export async function requireUser() {
  const current = await getCurrentUser();
  if (!current) redirect(`/login`);
  return current;
}

export async function requireEditor() {
  const current = await requireUser();
  if (current.role !== "editor" && current.role !== "admin") redirect("/login");
  return current;
}

export async function requireAdmin() {
  const current = await requireUser();
  if (current.role !== "admin") redirect("/");
  return current;
}
