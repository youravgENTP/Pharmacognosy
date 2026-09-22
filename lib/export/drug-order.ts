import { compareDrugIndexes } from "@/lib/drug-index";

export type ExportSortMode = "index" | "name" | "importance";
export type ExportOrderDrug = { catalogIndex: number | null; referenceIndex: number | null; koreanName: string; importance: "중요" | "중간" | "비중요" };
const importanceRank: Record<ExportOrderDrug["importance"], number> = { 중요: 0, 중간: 1, 비중요: 2 };

export function sortExportDrugs<T extends ExportOrderDrug>(drugs: T[], mode: ExportSortMode) {
  return [...drugs].sort((a, b) => mode === "name"
    ? a.koreanName.localeCompare(b.koreanName, "ko") || compareDrugIndexes(a, b)
    : mode === "importance"
      ? importanceRank[a.importance] - importanceRank[b.importance] || compareDrugIndexes(a, b)
      : compareDrugIndexes(a, b));
}
