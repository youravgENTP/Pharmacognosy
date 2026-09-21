import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CollectionWorkspace } from "@/components/collection-workspace";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export default async function CollectionWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1); if (!collection) notFound();
  return <CollectionWorkspace initial={collection}/>;
}
