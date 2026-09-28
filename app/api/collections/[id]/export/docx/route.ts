import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { createCollectionDocx } from "@/lib/export/collection-docx";
import { safeFilename } from "@/lib/export/common";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await authorizeApi("user");
  if (authError) return authError;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (collection.kind !== "document") return NextResponse.json({ error: "Document Collection이 아닙니다." }, { status: 409 });
  try {
    const buffer = await createCollectionDocx(collection.name, collection.document);
    const filename = encodeURIComponent(`${safeFilename(collection.name)}.docx`);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${filename}`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[CollectionExport] DOCX rendering failed", error);
    return NextResponse.json({ error: "DOCX 파일 생성에 실패했습니다." }, { status: 500 });
  }
}
