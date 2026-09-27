import { AlignmentType, Document, ImageRun, Packer, Paragraph, ShadingType, TextRun } from "docx";
import type { PdfCard, PdfField } from "@/lib/export/pdf";
import { cssColorToHex, parseInlineRuns } from "@/lib/rich-text";

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
  const packed = await Packer.toBuffer(document);
  return Buffer.isBuffer(packed) ? packed : Buffer.from(packed);
}

function fieldParagraphs(field: PdfField) {
  const result: Paragraph[] = [];
  const total = 1 + field.lines.length + (field.images?.length ?? 0);
  let index = 0;
  result.push(new Paragraph({ keepNext: total > 1, keepLines: true, spacing: { before: 120, after: 50 }, children: [new TextRun({ text: field.title, bold: true, color: "215F9D", size: 23, font: "Noto Sans KR" })] })); index++;
  for (const line of field.lines) { result.push(new Paragraph({ keepNext: index < total - 1, keepLines: true, indent: { left: (line.indent ?? 0) * 18 }, spacing: { after: 35 }, children: richRuns(line) })); index++; }
  for (const image of field.images ?? []) { if (!validImage(image)) { console.warn("[DataCardExport] DOCX image skipped: invalid geometry"); continue; } const type = imageType(image.buffer); if (!type) { console.warn("[DataCardExport] DOCX image skipped: unsupported bytes"); continue; } const maxWidth = 260; const width = Math.min(maxWidth, image.width); const height = Math.round(image.height * width / image.width); if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue; result.push(new Paragraph({ keepNext: Boolean(image.caption) || index < total - 1, keepLines: true, alignment: AlignmentType.LEFT, spacing: { after: 45 }, children: [new ImageRun({ type, data: image.buffer, transformation: { width, height } })] })); index++; if (image.caption) result.push(new Paragraph({ keepNext: index < total - 1, keepLines: true, children: [new TextRun({ text: image.caption, color: "6A7480", size: 16 })] })); }
  return result;
}

function imageType(buffer: Buffer): "png" | "jpg" | "gif" | "bmp" | null { if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png"; if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg"; if (buffer.subarray(0, 3).toString() === "GIF") return "gif"; if (buffer.subarray(0, 2).toString() === "BM") return "bmp"; return null; }

function richRuns(line: import("@/lib/export/pdf").PdfLine) {
  const runs = (line.runs ?? parseInlineRuns(line.html, line.text)).filter((run) => typeof run.text === "string");
  return (runs.length ? runs : [{ text: line.text }]).flatMap((run) => {
    const highlight = cssColorToHex(run.highlight);
    return run.text.split("\n").map((text, index) => new TextRun({
      text,
      break: index ? 1 : undefined,
      bold: run.bold || line.bold,
      italics: run.italic || line.italic,
      strike: run.strike,
      underline: run.underline ? {} : undefined,
      superScript: Boolean(run.superscript),
      subScript: !run.superscript && Boolean(run.subscript),
      characterSpacing: run.characterSpacing === "tight" ? -6 : run.characterSpacing === "wide" ? 16 : 0,
      color: cssColorToHex(run.color) ?? cssColorToHex(line.color),
      shading: highlight ? { type: ShadingType.CLEAR, fill: highlight, color: "auto" } : undefined,
      size: (line.size ?? 10) * 2,
      font: "Noto Sans KR",
    }));
  });
}

function validImage(image: import("@/lib/export/pdf").PdfImage) { return image.buffer.length > 0 && Number.isFinite(image.width) && Number.isFinite(image.height) && image.width > 0 && image.height > 0; }
