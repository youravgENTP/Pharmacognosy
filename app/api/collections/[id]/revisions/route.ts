import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { collectionRevisions, collections, user } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validators";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const rows = await db.select({ id: collectionRevisions.id, revision: collectionRevisions.revision, document: collectionRevisions.document, savedByUserId: collectionRevisions.savedByUserId, savedByName: user.name, createdAt: collectionRevisions.createdAt }).from(collectionRevisions).innerJoin(user, eq(user.id, collectionRevisions.savedByUserId)).where(eq(collectionRevisions.collectionId, id)).orderBy(desc(collectionRevisions.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser(request.headers);
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (current.role !== "editor" && current.role !== "admin") return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const parsed = z.object({ revision: z.number().int().nonnegative() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid revision" }, { status: 400 });
  const [collection] = await db.select({ revision: collections.revision, document: collections.document }).from(collections).where(and(eq(collections.id, id), eq(collections.revision, parsed.data.revision))).limit(1);
  if (!collection) return NextResponse.json({ error: "Collection changed in another session", code: "REVISION_CONFLICT" }, { status: 409 });
  const [created] = await db.insert(collectionRevisions).values({ collectionId: id, revision: collection.revision, document: collection.document, savedByUserId: current.id }).onConflictDoNothing({ target: [collectionRevisions.collectionId, collectionRevisions.revision] }).returning();
  if (created) return NextResponse.json({ ...created, duplicate: false }, { status: 201 });
  const [existing] = await db.select().from(collectionRevisions).where(and(eq(collectionRevisions.collectionId, id), eq(collectionRevisions.revision, collection.revision))).limit(1);
  return NextResponse.json({ ...existing, duplicate: true });
}
