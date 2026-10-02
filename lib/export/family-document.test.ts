import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createCardsDocx } from "@/lib/export/docx";
import { composeFamilyExportCards } from "@/lib/export/family-document";
import { createCardsPdf, type PdfCard } from "@/lib/export/pdf";

const cover: PdfCard = { title: "운향과", latinName: "Rutaceae", subtitle: "Rutaceae", role: "cover", fields: [{ title: "Summary", lines: [{ text: "공통 특징" }] }, { title: "소속 생약", lines: [{ text: "지실, 진피, 황백" }] }] };
const drugs = [
  { id: "a", categoryId: "fruit", categoryName: "과실류" },
  { id: "b", categoryId: "fruit", categoryName: "과실류" },
  { id: "c", categoryId: "bark", categoryName: "피류" },
];
const drugCards: PdfCard[] = [
  { sourceId: "a", title: "지실", exportIndex: "1", fields: [] },
  { sourceId: "b", title: "진피", exportIndex: "2", fields: [] },
  { sourceId: "c", title: "황백", exportIndex: "3", fields: [] },
];

test("Family export keeps summary first, category grouping, and existing herb order", () => {
  const cards = composeFamilyExportCards(cover, drugs, drugCards);
  assert.deepEqual(cards.map((card) => card.title), ["운향과", "과실류", "지실", "진피", "피류", "황백"]);
  assert.equal(cards[1].role, "section");
  assert.equal(cards[0].fields.find((field) => field.title === "소속 생약")?.lines[0].text, "지실, 진피, 황백");
});

test("Family cards render through the existing DOCX and PDF engines", async () => {
  const cards = composeFamilyExportCards(cover, drugs, drugCards);
  const [docx, pdf] = await Promise.all([createCardsDocx(cards, 2), createCardsPdf(cards, 2)]);
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml")!.async("string");
  for (const text of ["운향과", "Rutaceae", "Summary", "공통 특징", "소속 생약", "과실류", "지실", "진피", "피류", "황백"]) assert.match(xml, new RegExp(text));
  assert.match(xml, /<w:cols[^>]*w:num="2"/);
});
