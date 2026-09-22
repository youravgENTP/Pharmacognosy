import ExcelJS from "exceljs";
import type { CollectionTableBlock, TableCell, TableRange } from "@/lib/db/schema";
import { plainText } from "@/lib/export/common";

export async function createSpreadsheetXlsx(name: string, block: CollectionTableBlock) {
  validateMerges(block.mergedRanges, block.rows, block.columns);
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Herb Overflow"; workbook.created = new Date();
  const sheet = workbook.addWorksheet(name.slice(0, 31) || "Collection", { views: [{ state: "frozen", xSplit: 0, ySplit: 0 }] });
  for (let column = 0; column < block.columns; column++) sheet.getColumn(column + 1).width = Math.max(6, (block.columnSizes[column] ?? 128) / 7);
  for (let row = 0; row < block.rows; row++) { const worksheetRow = sheet.getRow(row + 1); worksheetRow.height = (block.rowSizes[row] ?? 34) * 0.75; for (let column = 0; column < block.columns; column++) applyCell(worksheetRow.getCell(column + 1), block.cells[`${row}:${column}`]); }
  for (const source of block.mergedRanges) { const range = normalize(source); sheet.mergeCells(range.startRow + 1, range.startColumn + 1, range.endRow + 1, range.endColumn + 1); }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function applyCell(target: ExcelJS.Cell, source?: TableCell) {
  if (!source) { target.value = ""; return; }
  const richText = htmlRichText(source.html);
  target.value = richText.length > 1 || richText.some((run) => Object.keys(run.font ?? {}).length) ? { richText } : source.text;
  target.font = { name: "Noto Sans KR", size: 10, bold: source.bold, italic: source.italic, strike: source.strikethrough, color: color(source.textColor) };
  if (source.highlight) target.fill = { type: "pattern", pattern: "solid", fgColor: color(source.highlight) ?? { argb: "FFFFFF00" } };
  target.alignment = { horizontal: source.horizontal ?? "left", vertical: source.vertical ?? "middle", wrapText: source.wrap || source.text.includes("\n") };
}

function htmlRichText(html?: string): ExcelJS.RichText[] {
  if (!html) return [];
  const tokens = html.replace(/<br\s*\/?\s*>/gi, "\n").split(/(<[^>]+>)/).filter(Boolean); const state = { bold: false, italic: false, strike: false, underline: false, color: undefined as string | undefined }; const runs: ExcelJS.RichText[] = [];
  for (const token of tokens) { if (token.startsWith("<")) { const closing = /^<\//.test(token); const tag = token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase(); if (tag === "b" || tag === "strong") state.bold = !closing; if (tag === "i" || tag === "em") state.italic = !closing; if (tag === "s" || tag === "strike" || tag === "del") state.strike = !closing; if (tag === "u") state.underline = !closing; if (tag === "span") state.color = closing ? undefined : token.match(/color\s*:\s*(#[0-9a-f]{6})/i)?.[1]; continue; } const text = plainText(undefined, token.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); if (text) runs.push({ text, font: { name: "Noto Sans KR", size: 10, bold: state.bold, italic: state.italic, strike: state.strike, underline: state.underline, color: color(state.color) } }); }
  return runs;
}

function color(value?: string) { return value && /^#[0-9a-f]{6}$/i.test(value) ? { argb: `FF${value.slice(1).toUpperCase()}` } : undefined; }
function normalize(range: TableRange) { return { startRow: Math.min(range.startRow, range.endRow), endRow: Math.max(range.startRow, range.endRow), startColumn: Math.min(range.startColumn, range.endColumn), endColumn: Math.max(range.startColumn, range.endColumn) }; }
function validateMerges(ranges: TableRange[], rows: number, columns: number) { const normalized = ranges.map(normalize); for (const [index, range] of normalized.entries()) { if (range.endRow >= rows || range.endColumn >= columns) throw new Error("Invalid merged range"); for (const other of normalized.slice(index + 1)) if (range.startRow <= other.endRow && range.endRow >= other.startRow && range.startColumn <= other.endColumn && range.endColumn >= other.startColumn) throw new Error("Overlapping merged ranges"); } }
