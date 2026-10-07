import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createFamiliesXlsx } from "@/lib/export/families-xlsx";

test("Botanical Families export creates family and member worksheets", async () => {
  const buffer = await createFamiliesXlsx([{ koreanName: "운향과", scientificName: "Rutaceae", acceptedScientificName: null, summary: [{ id: "summary", text: "감귤류 생약" }], summaryBlocks: [], drugs: [{ catalogIndex: 12, referenceIndex: null, koreanName: "진피", latinName: "Citri Unshius Pericarpium", categoryName: "과실류" }] }]);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Botanical Families", "Family Members"]);
  assert.equal(workbook.getWorksheet("Botanical Families")?.getCell("A2").value, "운향과");
  assert.equal(workbook.getWorksheet("Botanical Families")?.getCell("D2").value, "감귤류 생약");
  assert.equal(workbook.getWorksheet("Family Members")?.getCell("E2").value, "진피");
});
