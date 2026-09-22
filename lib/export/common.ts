import type { StudyBlock, StudyItem } from "@/lib/db/schema";
import { parseInlineRuns } from "@/lib/rich-text";
export type { InlineTextRun } from "@/lib/rich-text";
export type { PdfField, PdfCard } from "@/lib/export/pdf";

export function safeFilename(value: string, fallback = "HerbOverflow") {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || fallback;
}

export function plainText(html: string | undefined, fallback: string) {
  if (!html) return fallback;
  return html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trimEnd();
}

export function richTextRuns(html: string | undefined, fallback: string) {
  return parseInlineRuns(html, fallback);
}

export function flattenStudyItems(items: StudyItem[], depth = 0): { text: string; html?: string; depth: number; bold?: boolean; italic?: boolean }[] {
  return items.flatMap((item) => [{ text: plainText(item.html, item.text), html: item.html, depth, bold: item.bold, italic: item.italic }, ...flattenStudyItems(item.children ?? [], depth + 1)]);
}

export function studyImages(blocks: StudyBlock[] | undefined) {
  return (blocks ?? []).filter((block): block is Extract<StudyBlock, { type: "image" }> => block.type === "image");
}

export function hierarchyMarker(depth: number, index: number) {
  if (depth === 0) return `${toRoman(index + 1).toLowerCase()})`;
  if (depth === 1 && index < 20) return String.fromCodePoint(0x2460 + index);
  if (depth === 2) return `${String.fromCharCode(97 + index % 26)})`;
  return "•";
}

function toRoman(value: number) { const pairs: [number, string][] = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]]; let left = value, result = ""; for (const [number, token] of pairs) while (left >= number) { result += token; left -= number; } return result; }
