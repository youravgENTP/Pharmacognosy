import { z } from "zod";
import type { PdfCard } from "@/lib/export/common";
import { safeFilename } from "@/lib/export/common";

const familyExportBodySchema = z.object({
  format: z.enum(["docx", "pdf"]),
  columns: z.union([z.literal(1), z.literal(2)]),
  mnemonicMode: z.enum(["preferred", "mine", "user", "none", "all"]).default("preferred"),
  mnemonicUserId: z.string().optional(),
});
type FamilyExportBody = z.infer<typeof familyExportBodySchema>;

export type FamilyExportDependencies = {
  authenticate: (headers: Headers) => Promise<{ id: string } | null>;
  loadCards: (familyId: string, userId: string, options: FamilyExportBody) => Promise<PdfCard[] | null>;
  renderDocx: (cards: PdfCard[], columns: 1 | 2) => Promise<Buffer>;
  renderPdf: (cards: PdfCard[], columns: 1 | 2) => Promise<Buffer>;
};

export async function handleFamilyExportRequest(request: Request, familyId: string, dependencies: FamilyExportDependencies) {
  const current = await dependencies.authenticate(request.headers);
  if (!current) return Response.json({ error: "Authentication required" }, { status: 401 });
  const parsed = familyExportBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "내보내기 요청이 올바르지 않습니다." }, { status: 400 });
  try {
    const cards = await dependencies.loadCards(familyId, current.id, parsed.data);
    if (!cards) return Response.json({ error: "Family를 찾지 못했습니다." }, { status: 404 });
    if (cards.length <= 1) return Response.json({ error: "내보낼 소속 생약이 없습니다." }, { status: 400 });
    const buffer = parsed.data.format === "docx" ? await dependencies.renderDocx(cards, parsed.data.columns) : await dependencies.renderPdf(cards, parsed.data.columns);
    const valid = parsed.data.format === "docx" ? buffer.subarray(0, 2).toString() === "PK" : buffer.subarray(0, 4).toString() === "%PDF";
    if (!valid) throw new Error("Invalid export output");
    const extension = parsed.data.format;
    const contentType = extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
    const filename = safeFilename(`HerbOverflow-${cards[0].title}`, "HerbOverflow-Family");
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="HerbOverflow-Family.${extension}"; filename*=UTF-8''${encodeURIComponent(filename)}.${extension}`, "Content-Length": String(buffer.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("Family export failed", { familyId, format: parsed.data.format, error });
    return Response.json({ error: `${parsed.data.format.toUpperCase()} 파일 생성에 실패했습니다.` }, { status: 500 });
  }
}
