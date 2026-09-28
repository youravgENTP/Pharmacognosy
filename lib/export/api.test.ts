import assert from "node:assert/strict";
import test from "node:test";
import { handleDataCardExportRequest, type DataCardExportDependencies } from "@/lib/export/api";
import { createCardsDocx } from "@/lib/export/docx";
import type { PdfCard } from "@/lib/export/pdf";

const id = "10000000-0000-4000-8000-000000000001";
const cards: PdfCard[] = [{ title: "연교", fields: [{ title: "성분", lines: [{ text: "Lignan" }] }] }];
const dependencies: DataCardExportDependencies = { authenticate: async () => ({ id: "user" }), loadCards: async () => cards, renderDocx: createCardsDocx };
function request(body: unknown) { return new Request("http://localhost/api/export/drugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

test("Data Card export request rejects invalid and unauthenticated requests", async () => {
  const unauthorized = await handleDataCardExportRequest(request({ drugIds: [id], format: "docx", columns: 1 }), { ...dependencies, authenticate: async () => null });
  assert.equal(unauthorized.status, 401);
  const invalid = await handleDataCardExportRequest(request({ drugIds: [], format: "docx", columns: 3 }), dependencies);
  assert.equal(invalid.status, 400);
  const pdf = await handleDataCardExportRequest(request({ drugIds: [id], format: "pdf", columns: 1 }), dependencies);
  assert.equal(pdf.status, 400);
});

test("Data Card export request returns a real DOCX with correct content type and magic bytes", async () => {
  const response = await handleDataCardExportRequest(request({ drugIds: [id], format: "docx", columns: 2, mnemonicMode: "preferred" }), dependencies);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), "PK");
});

test("DOCX renderer errors are safe and machine-readable", async () => {
  const response = await handleDataCardExportRequest(request({ drugIds: [id], format: "docx", columns: 1 }), { ...dependencies, renderDocx: async () => { throw new Error("internal stack detail"); } });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: "DOCX 파일 생성에 실패했습니다.", code: "DOCX_RENDER_FAILED" });
});
