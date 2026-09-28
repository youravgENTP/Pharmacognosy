import type { ImportDrug, ImportItem, PharmacognosyImportV1 } from "@/lib/import-schema";
import { parseInlineRuns, sanitizeRichHtml, serializeInlineRuns, visibleRichText, type InlineTextRun } from "@/lib/rich-text";

export type ImportCorrection = { path: string; original: string; normalized: string; reason: string };
export type ImportNormalizationIssue = { code: "rich-text-mismatch" | "rich-text-normalization"; path: string; message: string };

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

const hierarchyMarker = /^\s*(?:(?:[ivxlcdm]+|[a-z])\)|\d+\.|[①-⑳]|\([0-9]+\)|[•·●▪◦-])\s+/i;

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
  const issues: ImportNormalizationIssue[][] = payload.drugs.map(() => []);
  const drugs = payload.drugs.map((drug, index) => normalizeDrug(drug, `drugs.${index}`, corrections[index], issues[index]));
  return { payload: { ...payload, drugs }, corrections, issues };
}

function normalizeDrug(drug: ImportDrug, path: string, corrections: ImportCorrection[], issues: ImportNormalizationIssue[]): ImportDrug {
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
    sections: drug.sections?.map((section, sectionIndex) => ({ ...section, items: normalizeItems(section.items, `${path}.sections.${sectionIndex}.items`, corrections, issues) })),
    relationships: drug.relationships?.map((relationship, relationIndex) => ({ ...relationship, type: normalizeRelationshipType(relationship.type), notes: relationship.notes == null ? relationship.notes : corrected(relationship.notes, `${path}.relationships.${relationIndex}.notes`, corrections) })),
    identityTerms: drug.identityTerms?.map((term, termIndex) => corrected(term, `${path}.identityTerms.${termIndex}`, corrections)),
    mnemonic: drug.mnemonic ? {
      ...drug.mnemonic,
      ...(drug.mnemonic.text ? { text: normalizeMnemonicText(drug.mnemonic.text, `${path}.mnemonic.text`, issues) } : {}),
      ...(drug.mnemonic.items ? { items: normalizeItems(drug.mnemonic.items, `${path}.mnemonic.items`, corrections, issues) } : {}),
    } : undefined,
  };
}

function normalizeItems(items: ImportItem[], path: string, corrections: ImportCorrection[], issues: ImportNormalizationIssue[]): ImportItem[] {
  return items.map((item, index) => {
    const itemPath = `${path}.${index}.text`;
    const richPath = `${path}.${index}.html`;
    if (item.html !== undefined) {
      const sanitized = sanitizeRichHtml(item.html);
      const runs = parseInlineRuns(sanitized, "");
      const formattedText = runs.map((run) => run.text).join("");
      if (comparableText(formattedText) !== comparableText(item.text)) {
        issues.push({ code: "rich-text-mismatch", path: richPath, message: `rich-text mismatch · plain text: “${item.text}” · formatted text: “${formattedText}”` });
      }
      const normalized = normalizeRichItem(item.text, runs, itemPath, corrections, issues);
      return {
        ...item,
        text: normalized.text,
        html: serializeInlineRuns(normalized.runs),
        ...(item.children ? { children: normalizeItems(item.children, `${path}.${index}.children`, corrections, issues) } : {}),
      };
    }
    const withoutMarker = item.text.replace(hierarchyMarker, "").trim();
    if (withoutMarker !== item.text) corrections.push({ path: itemPath, original: item.text, normalized: withoutMarker, reason: "hierarchy marker removed" });
    const text = corrected(withoutMarker, itemPath, corrections);
    return { ...item, text, ...(item.children ? { children: normalizeItems(item.children, `${path}.${index}.children`, corrections, issues) } : {}) };
  });
}

function normalizeRichItem(text: string, sourceRuns: InlineTextRun[], path: string, corrections: ImportCorrection[], issues: ImportNormalizationIssue[]) {
  const withoutMarker = text.replace(hierarchyMarker, "").trim();
  if (withoutMarker !== text) corrections.push({ path, original: text, normalized: withoutMarker, reason: "hierarchy marker removed" });
  let normalizedText = normalizeWhitespace(withoutMarker);
  let runs = normalizeRunWhitespace(stripRunMarker(sourceRuns));
  for (const rule of correctionRules) {
    const original = normalizedText;
    const expected = original.replace(rule.pattern, rule.replacement);
    if (expected === original) continue;
    const changedRuns = runs.map((run) => ({ ...run, text: run.text.replace(rule.pattern, rule.replacement) }));
    if (changedRuns.map((run) => run.text).join("") !== expected) {
      issues.push({ code: "rich-text-normalization", path: path.replace(/\.text$/, ".html"), message: `서식 경계를 가로지르는 “${original}” 교정을 안전하게 적용할 수 없습니다.` });
    } else runs = changedRuns;
    corrections.push({ path, original, normalized: expected, reason: rule.reason });
    normalizedText = expected;
  }
  if (runs.map((run) => run.text).join("") !== normalizedText) {
    issues.push({ code: "rich-text-normalization", path: path.replace(/\.text$/, ".html"), message: "텍스트 정규화를 서식 HTML에 동일하게 적용할 수 없습니다." });
  }
  return { text: normalizedText, runs };
}

function stripRunMarker(runs: InlineTextRun[]) {
  const match = runs.map((run) => run.text).join("").match(hierarchyMarker);
  if (!match) return runs.map((run) => ({ ...run }));
  let remaining = match[0].length;
  return runs.map((run) => {
    const remove = Math.min(remaining, run.text.length);
    remaining -= remove;
    return { ...run, text: run.text.slice(remove) };
  }).filter((run) => run.text);
}

function normalizeRunWhitespace(runs: InlineTextRun[]) {
  const normalized: InlineTextRun[] = [];
  let started = false;
  let pendingSpace = false;
  for (const run of runs) for (const character of run.text.normalize("NFC")) {
    if (/\s/u.test(character)) { if (started) pendingSpace = true; continue; }
    const text = `${pendingSpace ? " " : ""}${character}`;
    pendingSpace = false; started = true;
    const previous = normalized.at(-1);
    const style = { ...run, text: undefined };
    if (previous && JSON.stringify({ ...previous, text: undefined }) === JSON.stringify(style)) previous.text += text;
    else normalized.push({ ...run, text });
  }
  return normalized;
}

function normalizeWhitespace(value: string) { return value.normalize("NFC").trim().replace(/\s+/g, " "); }
function comparableText(value: string) { return normalizeWhitespace(value.replace(/\u00a0/g, " ")); }

function normalizeMnemonicText(value: { text: string; html?: string }, path: string, issues: ImportNormalizationIssue[]) {
  const text = value.text.normalize("NFC").replace(/\r\n?/g, "\n");
  if (value.html === undefined) return { text };
  const html = sanitizeRichHtml(value.html);
  const formattedText = visibleRichText(html).normalize("NFC").replace(/\r\n?/g, "\n");
  const comparable = (source: string) => source.replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").trim();
  if (comparable(text) !== comparable(formattedText)) issues.push({ code: "rich-text-mismatch", path: `${path}.html`, message: `rich-text mismatch · plain text: “${text}” · formatted text: “${formattedText}”` });
  return { text, html };
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
