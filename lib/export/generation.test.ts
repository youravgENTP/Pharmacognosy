import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import JSZip from "jszip";
import { createCardsDocx } from "@/lib/export/docx";
import { createCardsPdf, type PdfCard } from "@/lib/export/pdf";

async function fixture(): Promise<PdfCard[]> {
  const png = await sharp({ create: { width: 80, height: 50, channels: 3, background: "#5f8a70" } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 64, height: 96, channels: 3, background: "#dbe8dc" } }).jpeg().toBuffer();
  return [{
    title: "연교",
    subtitle: "Forsythiae Fructus · 중요",
    fields: [
      { title: "기원", lines: [{ text: "의성개나리 Forsythia viridissima" }] },
      { title: "성분", lines: [
        { text: "i) Lignan", indent: 0, runs: [{ text: "i) ", bold: true }, { text: "Lignan", italic: true, underline: true, color: "#245f3e", highlight: "#fff0a8" }] },
        { text: "① phillyrin", indent: 13, runs: [{ text: "① " }, { text: "phillyrin", strike: true }, { text: "2", superscript: true }, { text: "H", subscript: true }] },
        { text: "first\nsecond", runs: [{ text: "first\n", bold: true }, { text: "second", italic: true }] },
      ], images: [{ buffer: png, width: 80, height: 50 }, { buffer: jpeg, width: 64, height: 96 }] },
    ],
  }];
}

test("actual PDF generation supports Korean rich hierarchy and PNG/JPEG images", async () => {
  const buffer = await createCardsPdf(await fixture(), 2);
  assert.ok(buffer.length > 100);
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});

test("actual DOCX generation supports Korean rich hierarchy and PNG/JPEG images", async () => {
  const buffer = await createCardsDocx(await fixture(), 2);
  assert.ok(buffer.length > 100);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")?.async("string");
  assert.match(xml ?? "", /<w:br\/>/);
});

test("empty PDF still finalizes to a valid document", async () => {
  const buffer = await createCardsPdf([], 1);
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});
