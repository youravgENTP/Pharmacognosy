import type { ImportanceLevel, OriginPlant, StudySection } from "@/lib/db/schema";

export type ComparableDataCard = {
  koreanName: string;
  latinName: string | null;
  origin: string | null;
  origins: OriginPlant[];
  scientificName: string | null;
  medicinalPart: string | null;
  familyId: string | null;
  importance: ImportanceLevel;
  sections: StudySection[];
};

const contentKeys = ["koreanName", "latinName", "origin", "origins", "scientificName", "medicinalPart", "familyId", "importance", "sections"] as const;

export function normalizeDataCardContent<T extends ComparableDataCard>(value: T, mnemonicFieldId?: string): ComparableDataCard {
  const clean = stripUndefined(Object.fromEntries(contentKeys.map((key) => [key, value[key]]))) as ComparableDataCard;
  clean.sections = normalizeStudySections(clean.sections, mnemonicFieldId);
  return clean;
}

export function normalizeStudySections(sections: StudySection[], mnemonicFieldId?: string) {
  return stripUndefined(sections.map((section) => isMnemonicSection(section, mnemonicFieldId) ? { ...section, items: [], blocks: [] } : section)) as StudySection[];
}

export function compareDataCardContent(expected: ComparableDataCard, actual: ComparableDataCard) {
  const left = normalizeDataCardContent(expected);
  const right = normalizeDataCardContent(actual);
  const differences: string[] = [];
  collectDifferences(left, right, "", differences);
  return { equal: differences.length === 0, differences, expected: left, actual: right };
}

export function assessDataCardVerification(expected: ComparableDataCard, acceptedRevision: number, currentRevision: number, actual: ComparableDataCard) {
  const comparison = compareDataCardContent(expected, actual);
  const status = currentRevision < acceptedRevision ? "stale-response" : currentRevision > acceptedRevision && !comparison.equal ? "revision-reconflict" : comparison.equal ? "verified" : "content-mismatch";
  return { ...comparison, status } as const;
}

export function stableDataCardJson(value: ComparableDataCard) { return stableJson(normalizeDataCardContent(value)); }

function isMnemonicSection(section: StudySection, mnemonicFieldId?: string) {
  return section.title.trim() === "암기법" || Boolean(mnemonicFieldId && section.fieldDefinitionId === mnemonicFieldId);
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).map(([key, item]) => [key, stripUndefined(item)]));
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function collectDifferences(left: unknown, right: unknown, path: string, output: string[]) {
  if (stableJson(left) === stableJson(right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (isIdArray(left) && isIdArray(right)) {
      const leftIds = left.map((item) => item.id); const rightIds = right.map((item) => item.id);
      if (stableJson(leftIds) !== stableJson(rightIds)) output.push(`${path || "content"}.$order`);
      const leftMap = new Map(left.map((item) => [item.id, item])); const rightMap = new Map(right.map((item) => [item.id, item]));
      for (const id of new Set([...leftMap.keys(), ...rightMap.keys()])) collectDifferences(leftMap.get(id), rightMap.get(id), `${path}[id=${id}]`, output);
      return;
    }
    if (left.length !== right.length) output.push(`${path || "content"}.$length`);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) collectDifferences(left[index], right[index], `${path}[${index}]`, output);
    return;
  }
  if (isRecord(left) && isRecord(right)) {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) collectDifferences(left[key], right[key], path ? `${path}.${key}` : key, output);
    return;
  }
  output.push(path || "content");
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isIdArray(value: unknown[]): value is (Record<string, unknown> & { id: string })[] { return value.every((item) => isRecord(item) && typeof item.id === "string"); }
