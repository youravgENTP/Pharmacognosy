import { getCurrentUser } from "@/lib/auth/current-user";
import { createCardsDocx } from "@/lib/export/docx";
import { createCardsPdf } from "@/lib/export/pdf";
import { loadDrugExportCards } from "@/lib/export/drugs";
import { handleDataCardExportRequest } from "@/lib/export/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleDataCardExportRequest(request, { authenticate: (headers) => getCurrentUser(headers), loadCards: loadDrugExportCards, renderDocx: createCardsDocx, renderPdf: createCardsPdf });
}
