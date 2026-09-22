import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { createCollectionPdf } from "@/lib/export/collection-pdf";
import { safeFilename } from "@/lib/export/common";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("user"); if (authError) return authError; const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 }); const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1); if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 }); if (collection.kind !== "document") return NextResponse.json({ error: "Document Collection이 아닙니다." }, { status: 409 }); const buffer = await createCollectionPdf(collection.name, collection.document); const filename = encodeURIComponent(`${safeFilename(collection.name)}.pdf`); return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename*=UTF-8''${filename}`, "Cache-Control": "private, no-store" } }); }
