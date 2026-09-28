import assert from "node:assert/strict";
import test from "node:test";
import { importItemsWithIds, prepareImport, validateHierarchy, type ImportFieldDefinition } from "@/lib/import-pipeline";
import { pharmacognosyImportV1Schema, type ImportItem } from "@/lib/import-schema";
import { sanitizeRichHtml, visibleRichText } from "@/lib/rich-text";

const fields: ImportFieldDefinition[] = [
  { id: "10000000-0000-4000-8000-000000000001", name: "성분", inputMode: "hierarchy4", position: 10, active: true },
  { id: "10000000-0000-4000-8000-000000000002", name: "기타", inputMode: "hierarchy4", position: 80, active: true },
  { id: "10000000-0000-4000-8000-000000000003", name: "암기법", inputMode: "hierarchy4", position: 90, active: true },
];

function parsedDrug(item: ImportItem, placement: "section" | "mnemonic" = "section") {
  const drug = { koreanName: "진피", category: "과실류", ...(placement === "section" ? { sections: [{ field: "성분", items: [item] }] } : { mnemonic: { items: [item] } }) };
  return pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [drug] });
}

function prepare(item: ImportItem, placement: "section" | "mnemonic" = "section") {
  return prepareImport(parsedDrug(item, placement), { fields, existingDrugs: [] });
}

test("old plain-text ImportItem remains valid", () => {
  const parsed = parsedDrug({ text: "Hesperidin", children: [] });
  assert.equal(parsed.drugs[0].sections?.[0].items[0].text, "Hesperidin");
});

test("ImportItem with html validates", () => {
  const parsed = parsedDrug({ text: "Hesperidin", html: "<strong>Hesperidin</strong>" });
  assert.equal(parsed.drugs[0].sections?.[0].items[0].html, "<strong>Hesperidin</strong>");
});

test("nested child items preserve html through parsing", () => {
  const parsed = parsedDrug({ text: "parent", children: [{ text: "child", html: "<em>child</em>" }] });
  assert.equal(parsed.drugs[0].sections?.[0].items[0].children?.[0].html, "<em>child</em>");
});

test("importItemsWithIds preserves html and legacy formatting flags", () => {
  const [item] = importItemsWithIds([{ text: "A", html: "<u>A</u>", bold: true, italic: true, highlight: true }], () => "id");
  assert.deepEqual(item, { id: "id", text: "A", html: "<u>A</u>", bold: true, italic: true, highlight: true });
});

test("mnemonic import preserves html for userDrugMnemonics conversion", () => {
  const prepared = prepare({ text: "기억", html: "<span style=\"color:#c00000\">기억</span>" }, "mnemonic");
  const stored = importItemsWithIds(prepared.drugs[0].input.mnemonic!.items!, () => "id");
  assert.equal(stored[0].html, '<span style="color:#C00000">기억</span>');
  assert.equal(prepared.drugs[0].sections.length, 0);
});

test("unknown heading fallback to 기타 preserves child html", () => {
  const payload = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "A", category: "분류", sections: [{ field: "교수님 설명", items: [{ text: "red", html: "<span style=\"color:#f00\">red</span>" }] }] }] });
  const prepared = prepareImport(payload, { fields, existingDrugs: [] });
  assert.equal(prepared.drugs[0].sections[0].items[0].children?.[0].html, '<span style="color:#FF0000">red</span>');
});

for (const [name, html, expected] of [
  ["bold", "<strong>text</strong>", "<strong>text</strong>"],
  ["italic", "<em>text</em>", "<em>text</em>"],
  ["underline", "<u>text</u>", '<span style="text-decoration:underline">text</span>'],
  ["strikethrough", "<strike>text</strike>", '<span style="text-decoration:line-through">text</span>'],
  ["superscript", "x<sup>2</sup>", "x<sup>2</sup>"],
  ["subscript", "H<sub>2</sub>O", "H<sub>2</sub>O"],
] as const) test(`${name} formatting survives normalization`, () => {
  const plain = visibleRichText(html);
  const prepared = prepare({ text: plain, html });
  assert.equal(prepared.drugs[0].sections[0].items[0].html, expected);
});

test("safe font color survives and is normalized to uppercase six-digit hex", () => {
  assert.equal(sanitizeRichHtml('<span style="color:#c00000">red</span>'), '<span style="color:#C00000">red</span>');
});

test("multiple differently colored spans survive", () => {
  const html = '<span style="color:#c00000">red</span>/<span style="color:rgb(0, 0, 255)">blue</span>';
  assert.equal(prepare({ text: "red/blue", html }).drugs[0].sections[0].items[0].html, '<span style="color:#C00000">red</span>/<span style="color:#0000FF">blue</span>');
});

test("unsafe script and its contents are removed", () => {
  assert.equal(sanitizeRichHtml("safe<script>alert(1)</script>text"), "safetext");
});

test("event handler attributes and image sources are removed", () => {
  assert.equal(sanitizeRichHtml('<strong onclick="alert(1)">safe</strong><img src="x" onerror="alert(1)">'), "<strong>safe</strong>");
});

test("arbitrary CSS is removed while safe color remains", () => {
  assert.equal(sanitizeRichHtml('<span class="x" style="position:fixed;display:block;color:#123456;background-image:url(javascript:x)">safe</span>'), '<span style="color:#123456">safe</span>');
});

test("text/html visible-content mismatch blocks import", () => {
  const prepared = prepare({ text: "A", html: "<strong>B</strong>" });
  assert.equal(prepared.canCommit, false);
  assert.ok(prepared.drugs[0].errors.some((issue) => issue.code === "rich-text-mismatch"));
});

test("trivial whitespace differences do not trigger a mismatch", () => {
  const prepared = prepare({ text: "A B", html: "A   B" });
  assert.equal(prepared.canCommit, true);
  assert.equal(prepared.drugs[0].sections[0].items[0].html, "A B");
});

test("hierarchy marker removal updates text and html consistently", () => {
  const prepared = prepare({ text: "① Hesperidin", html: '① <span style="color:#C00000">Hesperidin</span>' });
  const item = prepared.drugs[0].sections[0].items[0];
  assert.equal(item.text, "Hesperidin");
  assert.equal(item.html, '<span style="color:#C00000">Hesperidin</span>');
});

test("decimal hierarchy marker removal updates text and html consistently", () => {
  const prepared = prepare({ text: "1. Hesperidin", html: "<strong>1.</strong> Hesperidin" });
  const item = prepared.drugs[0].sections[0].items[0];
  assert.equal(item.text, "Hesperidin");
  assert.equal(item.html, "Hesperidin");
});

test("a scientific decimal is not mistaken for a hierarchy marker", () => {
  const prepared = prepare({ text: "1.2 mg", html: "<strong>1.2</strong> mg" });
  assert.equal(prepared.drugs[0].sections[0].items[0].text, "1.2 mg");
});

test("typo normalization updates text and html while preserving formatting", () => {
  const prepared = prepare({ text: "anthraquionone", html: '<span style="color:#C00000">anthraquionone</span>' });
  const item = prepared.drugs[0].sections[0].items[0];
  assert.equal(item.text, "anthraquinone");
  assert.equal(item.html, '<span style="color:#C00000">anthraquinone</span>');
});

test("typo spanning two differently formatted runs blocks normalization", () => {
  const prepared = prepare({ text: "anthraquionone", html: '<strong>anthraqui</strong><em>onone</em>' });
  assert.equal(prepared.canCommit, false);
  assert.ok(prepared.drugs[0].errors.some((issue) => issue.code === "rich-text-normalization"));
});

test("old v1 JSON without html remains backwards compatible", () => {
  const prepared = prepare({ text: "plain", children: [{ text: "child" }] });
  assert.equal(prepared.canCommit, true);
  assert.equal(prepared.drugs[0].preview.richTextCount, 0);
});

test("hierarchy depth logic is unaffected by inline formatting", () => {
  const items = [{ text: "1", html: "<strong>1</strong>", children: [{ text: "2", html: "<em>2</em>", children: [{ text: "3", html: "<u>3</u>" }] }] }];
  assert.deepEqual(validateHierarchy("성분", items, "hierarchy3"), []);
});

test("preview counts rich text recursively across fields and mnemonic", () => {
  const payload = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "A", category: "분류", sections: [{ field: "성분", items: [{ text: "A", html: "<strong>A</strong>", children: [{ text: "B", html: "<em>B</em>" }] }] }], mnemonic: { items: [{ text: "C", html: "<u>C</u>" }] } }] });
  const prepared = prepareImport(payload, { fields, existingDrugs: [] });
  assert.equal(prepared.drugs[0].preview.richTextCount, 3);
});

test("combined bold and color formatting survives", () => {
  const html = '<strong><span style="color:#C00000">text</span></strong>';
  assert.equal(prepare({ text: "text", html }).drugs[0].sections[0].items[0].html, html);
});
