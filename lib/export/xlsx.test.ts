import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createSpreadsheetXlsx } from "@/lib/export/xlsx";

test("Spreadsheet Collection exports a native XLSX workbook", async () => {
  const buffer = await createSpreadsheetXlsx("성분 정리", {
    id: "table",
    type: "table",
    rows: 2,
    columns: 2,
    rowSizes: [34, 34],
    columnSizes: [128, 160],
    mergedRanges: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }],
    cells: {
      "0:0": { id: "a", text: "생약명", bold: true, horizontal: "center" },
      "0:1": { id: "b", text: "" },
      "1:0": { id: "c", text: "박하" },
      "1:1": { id: "d", text: "Menthol", italic: true },
    },
  });
  const zip = await JSZip.loadAsync(buffer);
  const workbook = await zip.file("xl/workbook.xml")?.async("string") ?? "";
  const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string") ?? "";

  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.match(workbook, /성분 정리/);
  assert.match(sheet, /<mergeCell ref="A1:B1"\/>/);
});
