import type { ImportDrug, ImportItem, PharmacognosyImportV1 } from "@/lib/import-schema";

export type ImportCorrection = { path: string; original: string; normalized: string; reason: string };

const fieldAliases = new Map<string, string>(([
  ["성분", "성분"], ["주성분", "성분"], ["주요 성분", "성분"],
  ["확인시험", "확인시험"], ["확인시험법", "확인시험"],
  ["규격시험", "규격시험·정량·기준"], ["규격시험법", "규격시험·정량·기준"], ["정량", "규격시험·정량·기준"], ["기준", "규격시험·정량·기준"], ["규격시험 / 정량 / 기준", "규격시험·정량·기준"],
  ["약리", "약리"], ["약리작용", "약리"],
  ["응용", "응용"], ["효능", "응용"],
  ["처방", "처방·생약유래 의약품"], ["생약유래 의약품", "처방·생약유래 의약품"], ["처방·생약유래 의약품", "처방·생약유래 의약품"],
  ["주의 및 부작용", "주의·부작용·독성"], ["주의 및 부작용 / 독성", "주의·부작용·독성"], ["주의·부작용", "주의·부작용·독성"], ["주의·부작용·독성", "주의·부작용·독성"], ["독성", "주의·부작용·독성"],
  ["기타", "기타"], ["암기법", "암기법"],
] as const).map(([alias, canonical]) => [normalizeKey(alias), canonical]));

const reservedSectionNames = new Set([
  "기원", "기원식물", "학명", "라틴학명", "생약명", "과", "과명", "약용부위", "분류", "카테고리", "중요도",
  "연관생약", "유사생약", "가공및기타사항", "동정", "식별", "암기법",
].map(normalizeKey));

const correctionRules: { pattern: RegExp; replacement: string; reason: string }[] = [
  { pattern: /\bPloygonaceae\b/g, replacement: "Polygonaceae", reason: "obvious spelling correction" },
  { pattern: /\bRheumpalmatum\b/g, replacement: "Rheum palmatum", reason: "obvious spacing correction" },
  { pattern: /\banthraquionone\b/gi, replacement: "anthraquinone", reason: "obvious spelling correction" },
];

const hierarchyMarker = /^\s*(?:(?:[ivxlcdm]+|[a-z])\)|[①-⑳]|\([0-9]+\)|[•·●▪◦-])\s+/i;

export function normalizeKey(value: string) {
  return value.normalize("NFC").trim().replace(/[\s_/]+/g, "").replace(/[ㆍ・]/g, "·").toLocaleLowerCase();
}

export function normalizeFieldAlias(value: string) {
  const trimmed = value.normalize("NFC").trim().replace(/\s+/g, " ");
  return fieldAliases.get(normalizeKey(trimmed)) ?? trimmed;
}

export function isReservedImportSection(value: string) { return reservedSectionNames.has(normalizeKey(value)); }

export function normalizeRelationshipType(value: string) {
  const key = normalizeKey(value);
  if (["related", "연관", "관련", "연관생약"].includes(key)) return "연관생약";
  if (["similar", "confusable", "유사", "혼동", "유사생약", "혼동생약"].includes(key)) return "유사생약";
  if (["processed", "가공", "가공생약", "가공/연관"].includes(key)) return "가공/연관";
  if (["substitute", "대체", "대체생약"].includes(key)) return "대체생약";
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function normalizeImportPayload(payload: PharmacognosyImportV1) {
  const corrections: ImportCorrection[][] = payload.drugs.map(() => []);
  const drugs = payload.drugs.map((drug, index) => normalizeDrug(drug, `drugs.${index}`, corrections[index]));
  return { payload: { ...payload, drugs }, corrections };
}

function normalizeDrug(drug: ImportDrug, path: string, corrections: ImportCorrection[]): ImportDrug {
  const string = (value: string | null | undefined, key: string) => value == null ? value : corrected(value, `${path}.${key}`, corrections);
  const nullable = (value: string | null, key: string) => value === null ? null : corrected(value, `${path}.${key}`, corrections);
  return {
    ...drug,
    latinName: string(drug.latinName, "latinName"),
    origin: string(drug.origin, "origin"),
    scientificName: string(drug.scientificName, "scientificName"),
    medicinalPart: string(drug.medicinalPart, "medicinalPart"),
    origins: drug.origins?.map((origin, index) => ({ nameKo: origin.nameKo, scientificName: nullable(origin.scientificName, `origins.${index}.scientificName`) })),
    family: drug.family ? { koreanName: drug.family.koreanName, scientificName: corrected(drug.family.scientificName, `${path}.family.scientificName`, corrections) } : drug.family,
    sections: drug.sections?.map((section, sectionIndex) => ({ ...section, items: normalizeItems(section.items, `${path}.sections.${sectionIndex}.items`, corrections) })),
    relationships: drug.relationships?.map((relationship, relationIndex) => ({ ...relationship, type: normalizeRelationshipType(relationship.type), notes: relationship.notes == null ? relationship.notes : corrected(relationship.notes, `${path}.relationships.${relationIndex}.notes`, corrections) })),
    identityTerms: drug.identityTerms?.map((term, termIndex) => corrected(term, `${path}.identityTerms.${termIndex}`, corrections)),
    mnemonic: drug.mnemonic ? { items: normalizeItems(drug.mnemonic.items, `${path}.mnemonic.items`, corrections) } : undefined,
  };
}

function normalizeItems(items: ImportItem[], path: string, corrections: ImportCorrection[]): ImportItem[] {
  return items.map((item, index) => {
    const itemPath = `${path}.${index}.text`;
    const withoutMarker = item.text.replace(hierarchyMarker, "").trim();
    if (withoutMarker !== item.text) corrections.push({ path: itemPath, original: item.text, normalized: withoutMarker, reason: "hierarchy marker removed" });
    const text = corrected(withoutMarker, itemPath, corrections);
    return { text, ...(item.children ? { children: normalizeItems(item.children, `${path}.${index}.children`, corrections) } : {}) };
  });
}

function corrected(value: string, path: string, corrections: ImportCorrection[]) {
  let normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  for (const rule of correctionRules) {
    const next = normalized.replace(rule.pattern, rule.replacement);
    if (next !== normalized) {
      corrections.push({ path, original: normalized, normalized: next, reason: rule.reason });
      normalized = next;
    }
  }
  return normalized;
}
