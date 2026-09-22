import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createCardsDocx } from "@/lib/export/docx";
import { loadDrugExportCards } from "@/lib/export/drugs";
import { createCardsPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

const bodySchema = z.object({ drugIds: z.array(z.string().uuid()).min(1).max(200), format: z.enum(["docx", "pdf"]), columns: z.union([z.literal(1), z.literal(2)]), mnemonicMode: z.enum(["preferred", "mine", "user", "none", "all"]).default("preferred"), mnemonicUserId: z.string().optional() });

export async function POST(request: Request) {
  const current = await getCurrentUser(request.headers); if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const cards = await loadDrugExportCards(parsed.data.drugIds, current.id, parsed.data);
  if (!cards.length) return NextResponse.json({ error: "내보낼 생약을 찾지 못했습니다." }, { status: 404 });
  const buffer = parsed.data.format === "docx" ? await createCardsDocx(cards, parsed.data.columns) : await createCardsPdf(cards, parsed.data.columns);
  const filename = `HerbOverflow-DataCards.${parsed.data.format}`;
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": parsed.data.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
