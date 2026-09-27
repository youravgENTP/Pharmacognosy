import { getCurrentUser } from "@/lib/auth/current-user";
import { createCardsDocx } from "@/lib/export/docx";
import { loadDrugExportCards } from "@/lib/export/drugs";
import { createCardsPdf } from "@/lib/export/pdf";
import { handleDataCardExportRequest } from "@/lib/export/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleDataCardExportRequest(request, { authenticate: (headers) => getCurrentUser(headers), loadCards: loadDrugExportCards, renderPdf: createCardsPdf, renderDocx: createCardsDocx });
}
