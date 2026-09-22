import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { safeFilename } from "@/lib/export/common";
import { createSpreadsheetXlsx } from "@/lib/export/xlsx";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("user"); if (authError) return authError; const { id } = await params; if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 }); const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1); if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 }); if (collection.kind !== "spreadsheet" || collection.document.blocks.length !== 1 || collection.document.blocks[0]?.type !== "table") return NextResponse.json({ error: "Spreadsheet Collection이 아닙니다." }, { status: 409 }); try { const buffer = await createSpreadsheetXlsx(collection.name, collection.document.blocks[0]); const filename = encodeURIComponent(`${safeFilename(collection.name)}.xlsx`); return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${filename}`, "Cache-Control": "private, no-store" } }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Excel export failed" }, { status: 400 }); } }
