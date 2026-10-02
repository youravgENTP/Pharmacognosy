import assert from "node:assert/strict";
import test from "node:test";
import { handleFamilyExportRequest, type FamilyExportDependencies } from "@/lib/export/family-api";
import type { PdfCard } from "@/lib/export/pdf";

const cards: PdfCard[] = [{ title: "운향과", role: "cover", fields: [] }, { title: "진피", sourceId: "drug", fields: [] }];
const dependencies: FamilyExportDependencies = {
  authenticate: async () => ({ id: "user" }),
  loadCards: async () => cards,
  renderDocx: async () => Buffer.from("PK-family-docx"),
  renderPdf: async () => Buffer.from("%PDF-family-pdf"),
};
const request = (body: unknown) => new Request("http://localhost/api/export/families/id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("Family export validates authentication and request options", async () => {
  const unauthorized = await handleFamilyExportRequest(request({ format: "docx", columns: 2 }), "family", { ...dependencies, authenticate: async () => null });
  assert.equal(unauthorized.status, 401);
  const invalid = await handleFamilyExportRequest(request({ format: "xlsx", columns: 3 }), "family", dependencies);
  assert.equal(invalid.status, 400);
});

test("Family export returns DOCX and PDF with their correct content types", async () => {
  const docx = await handleFamilyExportRequest(request({ format: "docx", columns: 2, mnemonicMode: "preferred" }), "family", dependencies);
  assert.equal(docx.status, 200);
  assert.equal(docx.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const pdf = await handleFamilyExportRequest(request({ format: "pdf", columns: 1, mnemonicMode: "none" }), "family", dependencies);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
});
