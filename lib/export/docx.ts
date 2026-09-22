import { AlignmentType, Document, ImageRun, Packer, Paragraph, TextRun } from "docx";
import type { PdfCard, PdfField } from "@/lib/export/pdf";

export async function createCardsDocx(cards: PdfCard[], columns: 1 | 2) {
  const children: Paragraph[] = [];
  for (const [cardIndex, card] of cards.entries()) {
    if (cardIndex) children.push(new Paragraph({ spacing: { before: 260 } }));
    children.push(new Paragraph({ heading: "Title", keepNext: true, spacing: { before: cardIndex ? 180 : 0, after: 50 }, children: [new TextRun({ text: card.title, bold: true, size: 34, font: "Noto Sans KR" })] }));
    if (card.subtitle) children.push(new Paragraph({ keepNext: Boolean(card.fields.length), spacing: { after: 150 }, children: [new TextRun({ text: card.subtitle, color: "667384", size: 18, font: "Noto Sans KR" })] }));
    for (const field of card.fields) children.push(...fieldParagraphs(field));
  }
  const document = new Document({
    creator: "Herb Overflow",
    title: "Herb Overflow Data Cards",
    styles: { default: { document: { run: { font: "Noto Sans KR", size: 20 }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }, column: { count: columns, equalWidth: true, space: 360 } }, children }],
  });
  return Packer.toBuffer(document);
}

function fieldParagraphs(field: PdfField) {
  const result: Paragraph[] = [];
  const total = 1 + field.lines.length + (field.images?.length ?? 0);
  let index = 0;
  result.push(new Paragraph({ keepNext: total > 1, keepLines: true, spacing: { before: 120, after: 50 }, children: [new TextRun({ text: field.title, bold: true, color: "215F9D", size: 23, font: "Noto Sans KR" })] })); index++;
  for (const line of field.lines) { result.push(new Paragraph({ keepNext: index < total - 1, keepLines: true, indent: { left: (line.indent ?? 0) * 18 }, spacing: { after: 35 }, children: richRuns(line) })); index++; }
  for (const image of field.images ?? []) { const type = imageType(image.buffer); if (!type) continue; const maxWidth = 260; const width = Math.min(maxWidth, image.width); const height = Math.max(1, Math.round(image.height * width / image.width)); result.push(new Paragraph({ keepNext: Boolean(image.caption) || index < total - 1, keepLines: true, alignment: AlignmentType.LEFT, spacing: { after: 45 }, children: [new ImageRun({ type, data: image.buffer, transformation: { width, height } })] })); index++; if (image.caption) result.push(new Paragraph({ keepNext: index < total - 1, keepLines: true, children: [new TextRun({ text: image.caption, color: "6A7480", size: 16 })] })); }
  return result;
}

function imageType(buffer: Buffer): "png" | "jpg" | "gif" | "bmp" | null { if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png"; if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg"; if (buffer.subarray(0, 3).toString() === "GIF") return "gif"; if (buffer.subarray(0, 2).toString() === "BM") return "bmp"; return null; }

function richRuns(line: import("@/lib/export/pdf").PdfLine) {
  if (!line.html) return [new TextRun({ text: line.text, bold: line.bold, italics: line.italic, size: (line.size ?? 10) * 2, color: line.color?.replace("#", ""), font: "Noto Sans KR" })];
  const state = { bold: Boolean(line.bold), italic: Boolean(line.italic), strike: false, underline: false, color: line.color?.replace("#", "") }; const runs: TextRun[] = [];
  for (const token of line.html.replace(/<br\s*\/?\s*>/gi, "\n").split(/(<[^>]+>)/).filter(Boolean)) { if (token.startsWith("<")) { const closing = /^<\//.test(token); const tag = token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase(); if (tag === "b" || tag === "strong") state.bold = !closing || Boolean(line.bold); if (tag === "i" || tag === "em") state.italic = !closing || Boolean(line.italic); if (tag === "s" || tag === "strike" || tag === "del") state.strike = !closing; if (tag === "u") state.underline = !closing; if (tag === "span") state.color = closing ? line.color?.replace("#", "") : token.match(/color\s*:\s*#([0-9a-f]{6})/i)?.[1] ?? state.color; continue; } const text = token.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); if (text) runs.push(new TextRun({ text, bold: state.bold, italics: state.italic, strike: state.strike, underline: state.underline ? {} : undefined, color: state.color, size: (line.size ?? 10) * 2, font: "Noto Sans KR" })); }
  return runs.length ? runs : [new TextRun(line.text)];
}
