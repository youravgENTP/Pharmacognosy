import { and, desc, eq } from "drizzle-orm";
import { authorizeApi } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { crudeDrugs, dataCardBackupSnapshots } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("user"); if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return Response.json({ error: "Invalid id" }, { status: 400 });
  const [drug] = await db.select({ revision: crudeDrugs.dataRevision }).from(crudeDrugs).where(eq(crudeDrugs.id, id)).limit(1);
  if (!drug) return Response.json({ error: "Not found" }, { status: 404 });
  const [snapshot] = await db.select().from(dataCardBackupSnapshots).where(and(eq(dataCardBackupSnapshots.drugId, id), eq(dataCardBackupSnapshots.revision, drug.revision))).orderBy(desc(dataCardBackupSnapshots.createdAt)).limit(1);
  return Response.json({ revision: drug.revision, status: snapshot?.status ?? "pending", eligibleAt: snapshot?.eligibleAt ?? null, completedAt: snapshot?.completedAt ?? null, lastError: snapshot?.lastError ?? null }, { headers: { "Cache-Control": "no-store" } });
}
