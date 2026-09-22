import path from "node:path";
import PDFDocument from "pdfkit";

export type PdfLine = { text: string; html?: string; runs?: { text: string; bold?: boolean; italic?: boolean; color?: string }[]; indent?: number; bold?: boolean; italic?: boolean; size?: number; color?: string; gapAfter?: number };
export type PdfImage = { buffer: Buffer; width: number; height: number; caption?: string };
export type PdfTable = { rows: number; columns: number; cells: Record<string, { text: string; bold?: boolean; italic?: boolean; strikethrough?: boolean; highlight?: string; textColor?: string; horizontal?: "left" | "center" | "right"; vertical?: "top" | "middle" | "bottom" }>; rowSizes: number[]; columnSizes: number[]; mergedRanges: { startRow: number; startColumn: number; endRow: number; endColumn: number }[] };
export type PdfField = { title: string; lines: PdfLine[]; images?: PdfImage[]; table?: PdfTable };
export type PdfCard = { title: string; subtitle?: string; fields: PdfField[] };

const regularFont = path.join(process.cwd(), "node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff");
const boldFont = path.join(process.cwd(), "node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff");

export async function createCardsPdf(cards: PdfCard[], columns: 1 | 2) {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: "Herb Overflow Export", Creator: "Herb Overflow" } });
  doc.registerFont("Noto", regularFont); doc.registerFont("NotoBold", boldFont); doc.font("Noto");
  const chunks: Buffer[] = []; doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const flow = new PdfColumnFlow(doc, columns);
  for (const [cardIndex, card] of cards.entries()) {
    const headerHeight = flow.textHeight(card.title, 19, true) + (card.subtitle ? flow.textHeight(card.subtitle, 9, false) : 0) + 13;
    const firstHeight = card.fields[0] ? flow.fieldHeight(card.fields[0]) : 0;
    flow.ensure(Math.min(flow.capacity, headerHeight + firstHeight));
    if (cardIndex) flow.gap(12);
    flow.text(card.title, { size: 19, bold: true, color: "#14243a", gapAfter: 2 });
    if (card.subtitle) flow.text(card.subtitle, { size: 9, color: "#5d6b7b", gapAfter: 8 });
    for (const field of card.fields) flow.field(field);
  }
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) { doc.switchToPage(index); doc.font("Noto").fontSize(8).fillColor("#7d8792").text(`${index + 1} / ${range.count}`, 42, doc.page.height - 54, { width: doc.page.width - 84, align: "right", lineBreak: false }); }
  doc.end(); return done;
}

class PdfColumnFlow {
  private column = 0;
  private readonly margin = 42;
  private readonly gapWidth = 24;
  readonly capacity: number;
  constructor(private doc: PDFKit.PDFDocument, private columns: 1 | 2) { this.capacity = doc.page.height - this.margin * 2 - 10; this.position(); }
  private get width() { return (this.doc.page.width - this.margin * 2 - this.gapWidth * (this.columns - 1)) / this.columns; }
  private get x() { return this.margin + this.column * (this.width + this.gapWidth); }
  private get bottom() { return this.doc.page.height - this.margin; }
  private position() { this.doc.x = this.x; this.doc.y = this.margin; }
  private advance() { if (this.columns === 2 && this.column === 0) { this.column = 1; this.position(); } else { this.doc.addPage(); this.column = 0; this.position(); } }
  ensure(height: number) { if (this.doc.y + height > this.bottom && this.doc.y > this.margin + 2) { this.advance(); return true; } return false; }
  gap(value: number) { this.ensure(value); this.doc.y += value; }
  textHeight(text: string, size = 10, bold = false, indent = 0) { this.doc.font(bold ? "NotoBold" : "Noto").fontSize(size); return this.doc.heightOfString(text || " ", { width: this.width - indent, lineGap: 2 }); }
  text(text: string, line: Omit<PdfLine, "text"> = {}) { const size = line.size ?? 10, indent = line.indent ?? 0; const height = this.textHeight(text, size, line.bold, indent); this.ensure(height + (line.gapAfter ?? 2)); if (line.runs?.length) { this.doc.x = this.x + indent; for (const [index, run] of line.runs.entries()) this.doc.font(run.bold || line.bold ? "NotoBold" : "Noto").fontSize(size).fillColor(run.color ?? line.color ?? "#1c2733").text(run.text, { width: this.width - indent, lineGap: 2, oblique: run.italic || line.italic, continued: index < line.runs.length - 1 }); } else this.doc.font(line.bold ? "NotoBold" : "Noto").fontSize(size).fillColor(line.color ?? "#1c2733").text(text || " ", this.x + indent, this.doc.y, { width: this.width - indent, lineGap: 2, oblique: line.italic }); this.doc.y += line.gapAfter ?? 2; }
  fieldHeight(field: PdfField) { let value = field.title ? this.textHeight(field.title, 12, true) + 7 : 0; for (const line of field.lines) value += this.textHeight(line.text, line.size ?? 10, line.bold, line.indent ?? 0) + (line.gapAfter ?? 2); for (const image of field.images ?? []) value += Math.min(220, image.height * Math.min(1, (this.width - 8) / image.width)) + (image.caption ? 18 : 8); if (field.table) value += this.tableLayout(field.table).heights.reduce((sum, height) => sum + height, 0); return value + 9; }
  field(field: PdfField) {
    const estimated = this.fieldHeight(field); this.ensure(Math.min(estimated, this.capacity));
    if (field.title) this.text(field.title, { size: 12, bold: true, color: "#215f9d", gapAfter: 5 });
    for (const line of field.lines) this.text(line.text, line);
    for (const image of field.images ?? []) { const width = Math.min(this.width - 8, image.width); const height = image.height * width / image.width; this.ensure(Math.min(height + 22, this.capacity)); try { this.doc.image(image.buffer, this.x, this.doc.y, { fit: [width, Math.min(240, this.bottom - this.doc.y)] }); this.doc.y += Math.min(height, 240) + 4; if (image.caption) this.text(image.caption, { size: 8, color: "#687584" }); } catch { this.text("[이미지를 불러오지 못했습니다]", { size: 8, color: "#9a4d4d" }); } }
    if (field.table) this.table(field.table);
    this.gap(7);
  }
  private tableLayout(table: PdfTable) {
    const rawWidths = Array.from({ length: table.columns }, (_, index) => table.columnSizes[index] ?? 128);
    const scale = Math.min(1, this.width / rawWidths.reduce((sum, value) => sum + value, 0));
    const widths = rawWidths.map((value) => value * scale);
    const heights = Array.from({ length: table.rows }, (_, index) => Math.max(18, (table.rowSizes[index] ?? 34) * .62));
    const normalized = table.mergedRanges.map((range) => ({
      startRow: Math.min(range.startRow, range.endRow),
      endRow: Math.max(range.startRow, range.endRow),
      startColumn: Math.min(range.startColumn, range.endColumn),
      endColumn: Math.max(range.startColumn, range.endColumn),
    }));

    // Expand rows before drawing so wrapped text is never clipped. For a
    // vertically merged cell, any extra height belongs to its final row.
    for (let row = 0; row < table.rows; row++) {
      for (let column = 0; column < table.columns; column++) {
        const merge = normalized.find((range) => row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn);
        if (merge && (row !== merge.startRow || column !== merge.startColumn)) continue;
        const columnSpan = merge ? merge.endColumn - merge.startColumn + 1 : 1;
        const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
        const cell = table.cells[`${row}:${column}`];
        if (!cell?.text) continue;
        const cellWidth = widths.slice(column, column + columnSpan).reduce((sum, value) => sum + value, 0);
        this.doc.font(cell.bold ? "NotoBold" : "Noto").fontSize(7);
        const needed = this.doc.heightOfString(cell.text, { width: Math.max(4, cellWidth - 6), lineGap: 1 }) + 6;
        const current = heights.slice(row, row + rowSpan).reduce((sum, value) => sum + value, 0);
        if (needed > current) heights[row + rowSpan - 1] += needed - current;
      }
    }

    return { widths, heights, normalized };
  }

  private table(table: PdfTable) {
    const { widths, heights, normalized } = this.tableLayout(table);

    for (let row = 0; row < table.rows; row++) {
      const startingSpanHeight = normalized
        .filter((range) => range.startRow === row)
        .reduce((largest, range) => Math.max(largest, heights.slice(row, range.endRow + 1).reduce((sum, value) => sum + value, 0)), heights[row]);
      this.ensure(Math.min(startingSpanHeight, this.capacity));
      const y = this.doc.y;
      let x = this.x;
      for (let column = 0; column < table.columns; column++) {
        const merge = normalized.find((range) => row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn);
        if (merge && (row !== merge.startRow || column !== merge.startColumn)) {
          x += widths[column];
          continue;
        }
        const columnSpan = merge ? merge.endColumn - merge.startColumn + 1 : 1;
        const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
        const cellWidth = widths.slice(column, column + columnSpan).reduce((sum, value) => sum + value, 0);
        const cellHeight = heights.slice(row, row + rowSpan).reduce((sum, value) => sum + value, 0);
        const cell = table.cells[`${row}:${column}`];
        if (cell?.highlight && /^#[0-9a-f]{6}$/i.test(cell.highlight)) this.doc.save().fillColor(cell.highlight).rect(x, y, cellWidth, cellHeight).fill().restore();
        this.doc.strokeColor("#c9d0d7").lineWidth(.5).rect(x, y, cellWidth, cellHeight).stroke();
        if (cell?.text) {
          this.doc.font(cell.bold ? "NotoBold" : "Noto").fontSize(7).fillColor(cell.textColor && /^#[0-9a-f]{6}$/i.test(cell.textColor) ? cell.textColor : "#24303c");
          const textHeight = this.doc.heightOfString(cell.text, { width: Math.max(4, cellWidth - 6), lineGap: 1 });
          const offsetY = cell.vertical === "bottom" ? Math.max(3, cellHeight - textHeight - 3) : cell.vertical === "middle" ? Math.max(3, (cellHeight - textHeight) / 2) : 3;
          this.doc.text(cell.text, x + 3, y + offsetY, { width: Math.max(4, cellWidth - 6), align: cell.horizontal ?? "left", lineGap: 1, oblique: cell.italic });
          if (cell.strikethrough) this.doc.moveTo(x + 3, y + offsetY + textHeight / 2).lineTo(x + cellWidth - 3, y + offsetY + textHeight / 2).stroke();
        }
        x += cellWidth;
        column += columnSpan - 1;
      }
      this.doc.y = y + heights[row];
    }
  }
}
