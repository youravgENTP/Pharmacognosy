import { getCurrentUser } from "@/lib/auth/current-user";
import { createCardsDocx } from "@/lib/export/docx";
import { createCardsPdf } from "@/lib/export/pdf";
import { loadFamilyExportCards } from "@/lib/export/family";
import { handleFamilyExportRequest } from "@/lib/export/family-api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFamilyExportRequest(request, id, { authenticate: (headers) => getCurrentUser(headers), loadCards: loadFamilyExportCards, renderDocx: createCardsDocx, renderPdf: createCardsPdf });
}
