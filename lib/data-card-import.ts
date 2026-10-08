import type { OriginPlant, StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import { pharmacognosyImportV1Schema, type ImportItem, type PharmacognosyImportV1 } from "@/lib/import-schema";

type DataCardSource = {
  koreanName: string;
  latinName: string | null;
  origin: string | null;
  origins: OriginPlant[];
  scientificName: string | null;
  medicinalPart: string | null;
  importance: "중요" | "중간" | "비중요";
  category: string | null;
  family: { koreanName: string; scientificName: string } | null;
  sections: StudySection[];
  fieldNames: Map<string, string>;
  relationships: { targetKoreanName: string; type: string; notes: string | null }[];
  identityTerms: string[];
  mnemonic?: { items: StudyItem[]; blocks: StudyBlock[] };
};

export function buildDataCardImport(source: DataCardSource): PharmacognosyImportV1 {
  const mnemonicText = source.mnemonic?.blocks.find((block): block is Extract<StudyBlock, { type: "text" }> => block.type === "text")?.content;
  const payload: PharmacognosyImportV1 = {
    schema: "pharmacognosy.import",
    version: 1,
    replaceExisting: true,
    drugs: [{
      koreanName: source.koreanName,
      latinName: source.latinName,
      origin: source.origin,
      origins: source.origins,
      scientificName: source.scientificName,
      medicinalPart: source.medicinalPart,
      importance: source.importance,
      category: source.category,
      family: source.family,
      sections: source.sections
        .filter((section) => source.fieldNames.get(section.fieldDefinitionId ?? "") !== "암기법" && section.title !== "암기법")
        .map((section) => ({
          field: source.fieldNames.get(section.fieldDefinitionId ?? "") ?? section.title,
          title: source.fieldNames.get(section.fieldDefinitionId ?? "") ?? section.title,
          items: exportItems(section.items),
        })),
      relationships: source.relationships,
      identityTerms: source.identityTerms,
      ...(source.mnemonic ? {
        mnemonic: {
          ...(mnemonicText && (mnemonicText.text || mnemonicText.html) ? { text: mnemonicText } : {}),
          items: exportItems(source.mnemonic.items),
        },
      } : {}),
    }],
  };
  return pharmacognosyImportV1Schema.parse(payload);
}

function exportItems(items: StudyItem[]): ImportItem[] {
  return items.flatMap((item): ImportItem[] => {
    const children = exportItems(item.children ?? []);
    if (!item.text.trim()) return children;
    return [{
      text: item.text,
      ...(item.html !== undefined ? { html: item.html } : {}),
      ...(item.bold !== undefined ? { bold: item.bold } : {}),
      ...(item.italic !== undefined ? { italic: item.italic } : {}),
      ...(item.highlight !== undefined ? { highlight: item.highlight } : {}),
      ...(children.length ? { children } : {}),
    }];
  });
}
