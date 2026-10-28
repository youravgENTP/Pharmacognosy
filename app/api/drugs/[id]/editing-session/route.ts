import { and, eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { dataCardEditSessions } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const body = await request.json().catch(() => null);
  const sessionId = body && typeof body === "object" && "sessionId" in body ? body.sessionId : null;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(sessionId).success) return Response.json({ error: "Invalid editing session" }, { status: 400 });
  const current = await getCurrentUser(request.headers); if (!current) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.insert(dataCardEditSessions).values({ id: sessionId, drugId: id, userId: current.id, lastSeenAt: new Date(), closedAt: null }).onConflictDoUpdate({ target: dataCardEditSessions.id, set: { lastSeenAt: new Date(), closedAt: null } });
  return Response.json({ status: "open" });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const body = await request.json().catch(() => null);
  const sessionId = body && typeof body === "object" && "sessionId" in body ? body.sessionId : null;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(sessionId).success) return Response.json({ error: "Invalid editing session" }, { status: 400 });
  const current = await getCurrentUser(request.headers); if (!current) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.update(dataCardEditSessions).set({ closedAt: new Date(), lastSeenAt: new Date() }).where(and(eq(dataCardEditSessions.id, sessionId), eq(dataCardEditSessions.drugId, id), eq(dataCardEditSessions.userId, current.id)));
  return Response.json({ status: "closed" });
}
