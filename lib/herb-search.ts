import type { StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";

export type HerbSearchEntry = { label: string; text: string; priority: number; name?: boolean };
export type HerbSearchDocument = { entries: HerbSearchEntry[] };
export type HerbSearchMatch = { label: string; text: string };

export type HerbSearchSource = {
  index?: string | null;
  koreanName: string;
  latinName?: string | null;
  scientificName?: string | null;
  origin?: string | null;
  origins?: { nameKo: string | null; scientificName: string | null }[];
  medicinalPart?: string | null;
  categoryName?: string | null;
  family?: { koreanName: string; scientificName: string; acceptedScientificName?: string | null } | null;
  sections?: StudySection[];
  constituents?: { name: string; aliases?: string[]; notes?: string | null; taxa?: string[] }[];
  identityTerms?: string[];
  relationships?: { type: string; drugName: string; notes?: string | null }[];
};

export function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function buildHerbSearchDocument(herb: HerbSearchSource): HerbSearchDocument {
  const entries: HerbSearchEntry[] = [];
  const seen = new Set<string>();
  const add = (label: string, text: string | null | undefined, priority: number, name = false) => {
    const value = text?.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!value) return;
    const key = `${normalizeSearchText(label)}\u0000${normalizeSearchText(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ label, text: value, priority, name });
  };

  add("생약명", herb.koreanName, 1, true);
  add("Latin name", herb.latinName, 1, true);
  add("학명", herb.scientificName, 1, true);
  add("Index", herb.index, 6);
  if (herb.family) add("Family", [herb.family.koreanName, herb.family.scientificName, herb.family.acceptedScientificName].filter(Boolean).join(" · "), 3);
  add("류", herb.categoryName, 3);
  add("기원", herb.origin, 6);
  for (const origin of herb.origins ?? []) add("기원식물", [origin.nameKo, origin.scientificName].filter(Boolean).join(" · "), 6);
  add("약용부위", herb.medicinalPart, 6);

  for (const section of herb.sections ?? []) {
    const priority = sectionPriority(section.title);
    for (const text of visibleSectionText(section)) add(section.title, text, priority);
  }
  for (const constituent of herb.constituents ?? []) {
    add("성분", [constituent.name, ...(constituent.aliases ?? []), constituent.notes].filter(Boolean).join(" · "), 4);
    for (const taxon of constituent.taxa ?? []) add("성분 계열", taxon, 4);
  }
  for (const term of herb.identityTerms ?? []) add("가공 및 기타 사항", term, 6);
  for (const relationship of herb.relationships ?? []) add(relationship.type, [relationship.drugName, relationship.notes].filter(Boolean).join(" · "), 6);
  return { entries };
}

export function getHerbSearchMatches(document: HerbSearchDocument, query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return { score: 0, matches: [] as HerbSearchMatch[] };
  const matched = document.entries.filter((entry) => normalizeSearchText(entry.text).includes(needle));
  const score = matched.reduce((best, entry) => Math.min(best, entry.name && normalizeSearchText(entry.text) === needle ? 1 : entry.name ? 2 : entry.priority), Number.POSITIVE_INFINITY);
  return { score, matches: matched.sort((a, b) => (a.name && normalizeSearchText(a.text) === needle ? 1 : a.name ? 2 : a.priority) - (b.name && normalizeSearchText(b.text) === needle ? 1 : b.name ? 2 : b.priority)).map(({ label, text }) => ({ label, text })) };
}

function sectionPriority(title: string) {
  const key = normalizeSearchText(title).replace(/[\s·/]/g, "");
  if (key.includes("성분") || key.includes("compound")) return 4;
  if (["약리", "효능", "적응", "응용"].some((value) => key.includes(value))) return 5;
  return 6;
}

function visibleSectionText(section: StudySection) {
  const values: string[] = [];
  const visit = (items: StudyItem[]) => items.forEach((item) => { if (item.text.trim()) values.push(item.text); visit(item.children ?? []); });
  const blocks = section.blocks ?? [];
  for (const block of blocks) {
    if (block.type === "text" && block.content.text.trim()) values.push(block.content.text);
    if (block.type === "items") visit(block.items);
  }
  if (!blocks.some((block): block is Extract<StudyBlock, { type: "items" }> => block.type === "items")) visit(section.items);
  return values;
}
