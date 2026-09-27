import assert from "node:assert/strict";
import test from "node:test";
import { handleDataCardExportRequest, type DataCardExportDependencies } from "@/lib/export/api";
import { createCardsDocx } from "@/lib/export/docx";
import { createCardsPdf, type PdfCard } from "@/lib/export/pdf";

const id = "10000000-0000-4000-8000-000000000001";
const cards: PdfCard[] = [{ title: "연교", fields: [{ title: "성분", lines: [{ text: "Lignan" }] }] }];
const dependencies: DataCardExportDependencies = { authenticate: async () => ({ id: "user" }), loadCards: async () => cards, renderPdf: createCardsPdf, renderDocx: createCardsDocx };
function request(body: unknown) { return new Request("http://localhost/api/export/drugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

test("Data Card export request rejects invalid and unauthenticated requests", async () => {
  const unauthorized = await handleDataCardExportRequest(request({ drugIds: [id], format: "pdf", columns: 1 }), { ...dependencies, authenticate: async () => null });
  assert.equal(unauthorized.status, 401);
  const invalid = await handleDataCardExportRequest(request({ drugIds: [], format: "pdf", columns: 3 }), dependencies);
  assert.equal(invalid.status, 400);
});

test("Data Card export request returns a real PDF with correct content type and magic bytes", async () => {
  const response = await handleDataCardExportRequest(request({ drugIds: [id], format: "pdf", columns: 1, mnemonicMode: "none" }), dependencies);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
});

test("Data Card export request returns a real DOCX with correct content type and magic bytes", async () => {
  const response = await handleDataCardExportRequest(request({ drugIds: [id], format: "docx", columns: 2, mnemonicMode: "preferred" }), dependencies);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), "PK");
});

test("stage-specific renderer errors are safe and machine-readable", async () => {
  const response = await handleDataCardExportRequest(request({ drugIds: [id], format: "pdf", columns: 1 }), { ...dependencies, renderPdf: async () => { throw new Error("internal stack detail"); } });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "PDF 파일 생성에 실패했습니다.", code: "PDF_RENDER_FAILED" });
});
