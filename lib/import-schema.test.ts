import assert from "node:assert/strict";
import test from "node:test";
import { importExample, pharmacognosyImportV1Schema } from "@/lib/import-schema";

test("Import Schema v1 accepts the downloadable editor example", () => {
  const parsed = pharmacognosyImportV1Schema.parse(importExample);
  assert.equal(parsed.schema, "pharmacognosy.import");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.drugs[0].sections?.[0].items[0].children?.[0].text, "Hesperidin (정량성분)");
});

test("existing title-only v1 files remain valid without defaulting omitted merge fields", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "진피", category: "과실류", sections: [{ title: "성분", items: [{ text: "Flavonoid" }] }] }] });
  assert.equal(parsed.drugs[0].importance, undefined);
  assert.equal(parsed.drugs[0].sections?.[0].title, "성분");
});

test("existing v1 JSON with category still validates", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "진피", category: "과실류" }] });
  assert.equal(parsed.drugs[0].category, "과실류");
});

test("an existing-drug-style v1 payload may omit category", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "진피", sections: [{ field: "성분", items: [{ text: "Hesperidin" }] }] }] });
  assert.equal(Object.hasOwn(parsed.drugs[0], "category"), false);
});

test("extended v1 accepts origin plants, relationships, identity terms, and mnemonic", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "산약", category: "근류", origins: [{ nameKo: "마", scientificName: "Dioscorea batatas" }, { nameKo: "참마", scientificName: "Dioscorea japonica" }], relationships: [{ targetKoreanName: "참마", type: "연관생약", notes: null }], identityTerms: ["포제"], mnemonic: { items: [{ text: "기억" }] } }] });
  assert.equal(parsed.drugs[0].origins?.length, 2);
  assert.equal(parsed.drugs[0].relationships?.[0].targetKoreanName, "참마");
  assert.equal(parsed.drugs[0].mnemonic?.items?.[0].text, "기억");
});

test("extended v1 accepts origins independently", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "산약", category: "근류", origins: [{ nameKo: "마", scientificName: "Dioscorea batatas" }] }] });
  assert.equal(parsed.drugs[0].origins?.[0].nameKo, "마");
});

test("extended v1 accepts relationships independently", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "진피", category: "과실류", relationships: [{ targetKoreanName: "청피", type: "연관생약" }] }] });
  assert.equal(parsed.drugs[0].relationships?.length, 1);
});

test("extended v1 accepts a user mnemonic independently", () => {
  const parsed = pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "진피", category: "과실류", mnemonic: { items: [{ text: "기억" }] } }] });
  assert.equal(parsed.drugs[0].mnemonic?.items?.length, 1);
});

test("Import Schema v1 rejects duplicate Korean drug names", () => {
  const parsed = pharmacognosyImportV1Schema.safeParse({
    schema: "pharmacognosy.import",
    version: 1,
    drugs: [
      { koreanName: "진피", category: "과실류" },
      { koreanName: "진피", category: "과실류" },
    ],
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.issues[0].message, /중복/);
});

test("Import Schema v1 rejects backup-like JSON instead of silently importing it", () => {
  const parsed = pharmacognosyImportV1Schema.safeParse({ schema: "herboverflow.backup", version: 1, drugs: [] });
  assert.equal(parsed.success, false);
});
