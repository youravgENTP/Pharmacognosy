import ExcelJS from "exceljs";
import type { StudyBlock, StudyItem } from "@/lib/db/schema";
import { formatDrugIndex } from "@/lib/drug-index";

export type FamilyWorkbookRow = {
  koreanName: string;
  scientificName: string;
  acceptedScientificName: string | null;
  summary: StudyItem[];
  summaryBlocks: StudyBlock[];
  drugs: { catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; categoryName: string }[];
};

export async function createFamiliesXlsx(families: FamilyWorkbookRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Herb Overflow";
  workbook.created = new Date();
  const familySheet = workbook.addWorksheet("Botanical Families", { views: [{ state: "frozen", ySplit: 1 }] });
  familySheet.columns = [
    { header: "Family (한글)", key: "koreanName", width: 20 },
    { header: "Scientific name", key: "scientificName", width: 28 },
    { header: "Accepted name", key: "acceptedScientificName", width: 28 },
    { header: "Summary", key: "summary", width: 70 },
    { header: "소속 생약 수", key: "drugCount", width: 14 },
  ];
  for (const family of families) familySheet.addRow({ koreanName: family.koreanName, scientificName: family.scientificName, acceptedScientificName: family.acceptedScientificName ?? "", summary: studyText(family.summary, family.summaryBlocks), drugCount: family.drugs.length });
  styleSheet(familySheet);

  const memberSheet = workbook.addWorksheet("Family Members", { views: [{ state: "frozen", ySplit: 1 }] });
  memberSheet.columns = [
    { header: "Family (한글)", key: "familyKorean", width: 20 },
    { header: "Family scientific name", key: "familyScientific", width: 28 },
    { header: "류", key: "category", width: 15 },
    { header: "Index", key: "index", width: 11 },
    { header: "생약명", key: "koreanName", width: 20 },
    { header: "Latin name", key: "latinName", width: 28 },
  ];
  for (const family of families) for (const drug of family.drugs) memberSheet.addRow({ familyKorean: family.koreanName, familyScientific: family.scientificName, category: drug.categoryName, index: formatDrugIndex(drug.catalogIndex, drug.referenceIndex), koreanName: drug.koreanName, latinName: drug.latinName ?? "" });
  styleSheet(memberSheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function studyText(items: StudyItem[], blocks: StudyBlock[]) {
  const lines: string[] = [];
  const visit = (values: StudyItem[], depth = 0) => values.forEach((item) => { if (item.text.trim()) lines.push(`${"  ".repeat(depth)}${item.text.trim()}`); visit(item.children ?? [], depth + 1); });
  if (blocks.length) for (const block of blocks) {
    if (block.type === "text" && block.content.text.trim()) lines.push(block.content.text.trim());
    if (block.type === "items") visit(block.items);
    if (block.type === "image") lines.push("[이미지]");
  } else visit(items);
  return lines.join("\n");
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  const header = sheet.getRow(1);
  header.height = 25;
  header.font = { name: "Noto Sans KR", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF35684C" } };
  header.alignment = { vertical: "middle" };
  for (const row of sheet.getRows(2, Math.max(0, sheet.rowCount - 1)) ?? []) {
    row.font = { name: "Noto Sans KR", size: 10 };
    row.alignment = { vertical: "top", wrapText: true };
  }
}
