import type { CollectionDocument, CollectionTableBlock } from "@/lib/db/schema";

export function createCollectionTable(rows = 30, columns = 12): CollectionTableBlock {
  const cells: CollectionTableBlock["cells"] = {};
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) cells[`${row}:${column}`] = { id: crypto.randomUUID(), text: "" };
  return { id: crypto.randomUUID(), type: "table", rows, columns, cells, rowSizes: Array(rows).fill(34), columnSizes: Array(columns).fill(128), mergedRanges: [] };
}

export function initialCollectionDocument(kind: "document" | "spreadsheet"): CollectionDocument {
  return { version: 1, blocks: kind === "spreadsheet" ? [createCollectionTable()] : [] };
}
