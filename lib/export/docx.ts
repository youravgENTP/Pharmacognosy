import { AlignmentType, Column, Document, ImageRun, Packer, Paragraph, ShadingType, TextRun } from "docx";
import type { PdfCard, PdfField } from "@/lib/export/pdf";
import { cssColorToHex, parseInlineRuns } from "@/lib/rich-text";

const BODY_SIZE = 18;
const BODY_FONT = { ascii: "맑은 고딕", hAnsi: "맑은 고딕", eastAsia: "맑은 고딕", cs: "맑은 고딕" } as const;
const METADATA_FIELDS = new Set(["학명", "약용부위", "기원", "과", "연관생약", "유사생약", "가공 및 기타 사항"]);
const TWO_COLUMN_WIDTH_TWIPS = 5173;
const ONE_COLUMN_WIDTH_TWIPS = 10772;

export async function createCardsDocx(cards: PdfCard[], columns: 1 | 2) {
  const children: Paragraph[] = [];
  const contentWidthTwips = columns === 2 ? TWO_COLUMN_WIDTH_TWIPS : ONE_COLUMN_WIDTH_TWIPS;
  for (const [cardIndex, card] of cards.entries()) {
    const prefix = card.exportIndex ? `${card.exportIndex}. ` : "";
    const latinName = card.latinName ? ` (${card.latinName})` : "";
    children.push(new Paragraph({
      keepNext: Boolean(card.fields.length),
      keepLines: true,
      spacing: { before: cardIndex ? 180 : 0, after: 0 },
      children: [new TextRun({ text: `${prefix}${card.title}${latinName}`, bold: true, size: BODY_SIZE, font: BODY_FONT })],
    }));
    for (const field of card.fields) children.push(...fieldParagraphs(field, contentWidthTwips));
  }
  const document = new Document({
    creator: "Herb Overflow",
    title: "Herb Overflow Data Cards",
    styles: { default: { document: { run: { font: BODY_FONT, size: BODY_SIZE, color: "000000" }, paragraph: { spacing: { before: 0, after: 0 } } } } },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 567, right: 567, bottom: 816, left: 567 } },
        column: columns === 2
          ? { count: 2, equalWidth: false, space: 425, children: [new Column({ width: 5173, space: 425 }), new Column({ width: 5173 })] }
          : { count: 1, equalWidth: true },
      },
      children,
    }],
  });
  const packed = await Packer.toBuffer(document);
  return Buffer.isBuffer(packed) ? packed : Buffer.from(packed);
}

function fieldParagraphs(field: PdfField, contentWidthTwips: number) {
  const result: Paragraph[] = [];
  const total = 1 + field.lines.length + (field.images?.length ?? 0);
  let index = 0;
  if (METADATA_FIELDS.has(field.title) && field.lines.length) {
    for (const [lineIndex, line] of field.lines.entries()) {
      result.push(new Paragraph({
        keepNext: index < total - 1,
        keepLines: true,
        spacing: { before: 0, after: 0 },
        children: [
          ...(lineIndex === 0 ? [new TextRun({ text: `${field.title} : `, bold: true, size: BODY_SIZE, font: BODY_FONT })] : []),
          ...richRuns(line),
        ],
      }));
      index++;
    }
  } else {
    const mnemonic = field.title.startsWith("암기법");
    result.push(new Paragraph({
      keepNext: total > 1,
      keepLines: true,
      spacing: { before: 80, after: 0 },
      children: [new TextRun({ text: field.title, bold: true, color: mnemonic ? "FF0000" : "000000", size: BODY_SIZE, font: BODY_FONT })],
    }));
    index++;
    for (const line of field.lines) {
      result.push(new Paragraph({
        keepNext: index < total - 1,
        keepLines: true,
        indent: hierarchyIndent(line),
        spacing: { after: 0 },
        children: richRuns(line, mnemonic),
      }));
      index++;
    }
  }
  for (const image of field.images ?? []) {
    if (!validImage(image)) { console.warn("[DataCardExport] DOCX image skipped: invalid geometry"); continue; }
    const type = imageType(image.buffer);
    if (!type) { console.warn("[DataCardExport] DOCX image skipped: unsupported bytes"); continue; }
    const layout = imageLayout(image, contentWidthTwips);
    if (!Number.isFinite(layout.width) || !Number.isFinite(layout.height) || layout.width <= 0 || layout.height <= 0) continue;
    result.push(new Paragraph({
      keepNext: Boolean(image.caption) || index < total - 1,
      keepLines: true,
      alignment: AlignmentType.LEFT,
      indent: layout.leftTwips ? { left: layout.leftTwips } : undefined,
      spacing: { after: 0 },
      children: [new ImageRun({ type, data: image.buffer, transformation: { width: layout.width, height: layout.height }, altText: { name: `${field.title} 이미지`, description: image.caption || `${field.title} 학습 자료 이미지` } })],
    }));
    index++;
    if (image.caption) result.push(new Paragraph({ keepNext: index < total - 1, keepLines: true, indent: layout.leftTwips ? { left: layout.leftTwips } : undefined, children: [new TextRun({ text: image.caption, color: "666666", size: BODY_SIZE, font: BODY_FONT })] }));
  }
  return result;
}

function hierarchyIndent(line: import("@/lib/export/pdf").PdfLine) {
  if (!/^(?:[ivxlcdm]+\)|[①-⑳]|[a-z]\)|•)/i.test(line.text.trimStart())) return undefined;
  if ((line.indent ?? 0) >= 26) return { left: 900, hanging: 160 };
  if ((line.indent ?? 0) >= 13) return { left: 500, hanging: 220 };
  return { left: 160, hanging: 160 };
}

function imageType(buffer: Buffer): "png" | "jpg" | "gif" | "bmp" | null { if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png"; if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg"; if (buffer.subarray(0, 3).toString() === "GIF") return "gif"; if (buffer.subarray(0, 2).toString() === "BM") return "bmp"; return null; }

function richRuns(line: import("@/lib/export/pdf").PdfLine, forceBold = false) {
  const runs = (line.runs ?? parseInlineRuns(line.html, line.text)).filter((run) => typeof run.text === "string");
  return (runs.length ? runs : [{ text: line.text }]).flatMap((run) => {
    const highlight = cssColorToHex(run.highlight);
    return run.text.split("\n").map((text, index) => new TextRun({
      text,
      break: index ? 1 : undefined,
      bold: forceBold || run.bold || line.bold,
      italics: run.italic || line.italic,
      strike: run.strike,
      underline: run.underline ? {} : undefined,
      superScript: Boolean(run.superscript),
      subScript: !run.superscript && Boolean(run.subscript),
      characterSpacing: run.characterSpacing === "tight" ? -6 : run.characterSpacing === "wide" ? 16 : 0,
      color: cssColorToHex(run.color) ?? cssColorToHex(line.color),
      shading: highlight ? { type: ShadingType.CLEAR, fill: highlight, color: "auto" } : undefined,
      size: BODY_SIZE,
      font: BODY_FONT,
    }));
  });
}

function validImage(image: import("@/lib/export/pdf").PdfImage) { return image.buffer.length > 0 && Number.isFinite(image.width) && Number.isFinite(image.height) && image.width > 0 && image.height > 0; }

function imageLayout(image: import("@/lib/export/pdf").PdfImage, contentWidthTwips: number) {
  const widthPercent = Math.max(15, Math.min(100, image.widthPercent ?? 100));
  const xPercent = Math.max(0, Math.min(100 - widthPercent, image.xPercent ?? 0));
  const width = contentWidthTwips / 15 * widthPercent / 100;
  return { width, height: image.height * width / image.width, leftTwips: Math.round(contentWidthTwips * xPercent / 100) };
}
