import assert from "node:assert/strict";
import Module from "node:module";
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
    exportIndex: "72",
    latinName: "Forsythiae Fructus",
    fields: [
      { title: "기원", lines: [{ text: "의성개나리 Forsythia viridissima" }] },
      { title: "성분", lines: [
        { text: "i) Lignan", indent: 0, runs: [{ text: "i) ", bold: true }, { text: "Lignan", italic: true, underline: true, color: "#245f3e", highlight: "#fff0a8" }] },
        { text: "① phillyrin", indent: 13, runs: [{ text: "① " }, { text: "phillyrin", strike: true }, { text: "2", superscript: true }, { text: "H", subscript: true }] },
        { text: "first\nsecond", runs: [{ text: "first\n", bold: true }, { text: "second", italic: true }] },
      ], images: [{ buffer: png, width: 80, height: 50, widthPercent: 50, xPercent: 25 }, { buffer: jpeg, width: 64, height: 96, widthPercent: 75, xPercent: 0 }] },
      { title: "암기법", lines: [{ text: "붉은 열매를 기억", runs: [{ text: "붉은", bold: true, color: "#ff0000" }, { text: " 열매를 기억", bold: true }] }] },
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
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  const styles = await zip.file("word/styles.xml")?.async("string");
  assert.match(xml ?? "", /<w:br\/>/);
  assert.match(xml ?? "", /<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
  assert.match(xml ?? "", /<w:pgMar[^>]*w:top="567"[^>]*w:right="567"[^>]*w:bottom="816"[^>]*w:left="567"/);
  assert.match(xml ?? "", /<w:cols[^>]*w:space="425"[^>]*w:num="2"[^>]*w:equalWidth="false"/);
  assert.match(xml ?? "", /72\. 연교 \(Forsythiae Fructus\)/);
  assert.match(xml ?? "", /<w:color w:val="FF0000"\/>/);
  assert.doesNotMatch(xml ?? "", /215F9D/);
  assert.match(styles ?? "", /<w:rFonts[^>]*w:ascii="맑은 고딕"/);
  assert.match(styles ?? "", /<w:rFonts[^>]*w:hAnsi="맑은 고딕"/);
  assert.match(styles ?? "", /<w:rFonts[^>]*w:eastAsia="맑은 고딕"/);
  assert.match(styles ?? "", /<w:sz w:val="18"\/>/);
  const imageWidths = [...(xml ?? "").matchAll(/<wp:extent cx="(\d+)"/g)].map((match) => Number(match[1]) / 914400);
  assert.ok(Math.abs(imageWidths[0] - 3.592 * .5) < .01);
  assert.ok(Math.abs(imageWidths[1] - 3.592 * .75) < .01);
  assert.match(xml ?? "", /<w:ind w:left="1293"\/>/);
});

test("empty PDF still finalizes to a valid document", async () => {
  const buffer = await createCardsPdf([], 1);
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});

test("PDF generation does not depend on PDFKit's untraced Helvetica module", async () => {
  const moduleWithLoad = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = moduleWithLoad._load;
  moduleWithLoad._load = function (request, parent, isMain) {
    if (request === "#standard-fonts/Helvetica") throw new Error("Helvetica module must not be loaded");
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const buffer = await createCardsPdf([], 1);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});
