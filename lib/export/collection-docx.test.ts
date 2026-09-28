import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import sharp from "sharp";
import type { CollectionDocument } from "@/lib/db/schema";
import { createCardsDocx } from "@/lib/export/docx";
import { prepareCollectionExportCard } from "@/lib/export/prepare-collection";

test("Document Collection exports text, hierarchy, images, and tables to DOCX", async () => {
  const png = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#5f8a70" } }).png().toBuffer();
  const document: CollectionDocument = { version: 1, blocks: [
    { id: "heading", type: "heading", level: 1, content: { text: "정유 생약", html: "<b>정유 생약</b>" } },
    { id: "text", type: "text", content: { text: "핵심 내용", html: "<b>핵심</b> 내용" } },
    { id: "hierarchy", type: "hierarchy", items: [{ id: "item", text: "Menthol", italic: true, children: [{ id: "child", text: "박하" }] }] },
    { id: "image", type: "image", mediaAssetId: "image-id", widthPercent: 50, align: "center" },
    { id: "table", type: "table", rows: 2, columns: 2, rowSizes: [34, 34], columnSizes: [128, 128], mergedRanges: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }], cells: {
      "0:0": { id: "a", text: "표 제목", bold: true, horizontal: "center" },
      "0:1": { id: "b", text: "" },
      "1:0": { id: "c", text: "A" },
      "1:1": { id: "d", text: "B", highlight: "#fff0a8" },
    } },
  ] };
  const card = await prepareCollectionExportCard("테스트 컬렉션", document, async (id) => id === "image-id" ? { buffer: png, mimeType: "image/png", width: 80, height: 40 } : null, () => assert.fail("valid image should not warn"));
  const buffer = await createCardsDocx([card], 1);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string") ?? "";

  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.match(xml, /테스트 컬렉션/);
  assert.match(xml, /정유 생약/);
  assert.match(xml, /핵심/);
  assert.match(xml, /i\) Menthol/);
  assert.match(xml, /① 박하/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:gridSpan w:val="2"\/>/);
  assert.match(xml, /표 제목/);
  const widthInches = Number(xml.match(/<wp:extent cx="(\d+)"/)?.[1]) / 914400;
  assert.ok(Math.abs(widthInches - (10772 / 1440 * .5)) < .01);
});
