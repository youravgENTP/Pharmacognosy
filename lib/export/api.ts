import { z } from "zod";
import type { PdfCard } from "@/lib/export/pdf";
import { DataCardExportError, logDataCardExportError } from "@/lib/export/errors";

export const dataCardExportBodySchema = z.object({ drugIds: z.array(z.string().uuid()).min(1).max(200), format: z.enum(["docx", "pdf"]), columns: z.union([z.literal(1), z.literal(2)]), mnemonicMode: z.enum(["preferred", "mine", "user", "none", "all"]).default("preferred"), mnemonicUserId: z.string().optional() });
type ExportBody = z.infer<typeof dataCardExportBodySchema>;

export type DataCardExportDependencies = {
  authenticate: (headers: Headers) => Promise<{ id: string } | null>;
  loadCards: (drugIds: string[], userId: string, options: ExportBody) => Promise<PdfCard[]>;
  renderPdf: (cards: PdfCard[], columns: 1 | 2) => Promise<Buffer>;
  renderDocx: (cards: PdfCard[], columns: 1 | 2) => Promise<Buffer>;
};

export async function handleDataCardExportRequest(request: Request, dependencies: DataCardExportDependencies) {
  const current = await dependencies.authenticate(request.headers);
  if (!current) return Response.json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const parsed = dataCardExportBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "내보내기 요청이 올바르지 않습니다.", code: "INVALID_REQUEST" }, { status: 400 });
  const input = parsed.data;
  try {
    let cards: PdfCard[];
    try { cards = await dependencies.loadCards(input.drugIds, current.id, input); }
    catch (cause) { throw new DataCardExportError("DATA_LOAD_FAILED", "Data Card 내용을 불러오지 못했습니다.", "Data Card export preparation failed", { cause, context: { drugIds: input.drugIds } }); }
    if (!cards.length) return Response.json({ error: "내보낼 생약을 찾지 못했습니다.", code: "NO_EXPORT_CARDS" }, { status: 404 });
    let buffer: Buffer;
    if (input.format === "pdf") {
      try { buffer = await dependencies.renderPdf(cards, input.columns); }
      catch (cause) { throw new DataCardExportError("PDF_RENDER_FAILED", "PDF 파일 생성에 실패했습니다.", "PDF rendering failed", { cause }); }
    } else {
      try { buffer = await dependencies.renderDocx(cards, input.columns); }
      catch (cause) { throw new DataCardExportError("DOCX_RENDER_FAILED", "DOCX 파일 생성에 실패했습니다.", "DOCX rendering failed", { cause }); }
    }
    const valid = input.format === "docx" ? buffer.length > 2 && buffer.subarray(0, 2).toString() === "PK" : buffer.length > 4 && buffer.subarray(0, 4).toString() === "%PDF";
    if (!valid) throw new DataCardExportError("INVALID_EXPORT_OUTPUT", `${input.format.toUpperCase()} 파일 검증에 실패했습니다.`, `Invalid ${input.format.toUpperCase()} output`, { context: { byteLength: buffer.length } });
    const filename = `HerbOverflow-DataCards.${input.format}`;
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": input.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Content-Length": String(buffer.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const known = error instanceof DataCardExportError ? error : new DataCardExportError("DATA_LOAD_FAILED", "파일을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.", "Unexpected Data Card export failure", { cause: error });
    logDataCardExportError(known.message, known.cause ?? known, { format: input.format, drugCount: input.drugIds.length, code: known.code, ...known.context });
    return Response.json({ error: known.safeMessage, code: known.code }, { status: 500 });
  }
}
