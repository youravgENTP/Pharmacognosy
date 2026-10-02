import type { PdfCard } from "@/lib/export/common";

export type FamilyExportDrug = { id: string; categoryId: string | null; categoryName: string };

export function composeFamilyExportCards(cover: PdfCard, drugs: FamilyExportDrug[], drugCards: PdfCard[]) {
  const cardsById = new Map(drugCards.flatMap((card) => card.sourceId ? [[card.sourceId, card] as const] : []));
  const result: PdfCard[] = [cover];
  const groups = Array.from(drugs.reduce((map, drug) => {
    const key = drug.categoryId ?? "uncategorized";
    if (!map.has(key)) map.set(key, { name: drug.categoryName, drugs: [] as FamilyExportDrug[] });
    map.get(key)!.drugs.push(drug);
    return map;
  }, new Map<string, { name: string; drugs: FamilyExportDrug[] }>()).values());
  for (const group of groups) {
    const cards = group.drugs.map((drug) => cardsById.get(drug.id)).filter((card): card is PdfCard => Boolean(card));
    if (!cards.length) continue;
    result.push({ title: group.name, subtitle: `${cards.length}개 생약`, role: "section", fields: [] }, ...cards);
  }
  return result;
}
