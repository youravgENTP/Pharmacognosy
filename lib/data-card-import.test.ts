import assert from "node:assert/strict";
import test from "node:test";
import { buildDataCardImport } from "@/lib/data-card-import";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";

test("manual-save data card JSON is a valid replace-style Import v1 payload", () => {
  const payload = buildDataCardImport({
    koreanName: "진피",
    latinName: "Citri Unshius Pericarpium",
    origin: "귤나무의 열매껍질",
    origins: [{ nameKo: "귤나무", scientificName: "Citrus unshiu" }],
    scientificName: "Citrus unshiu",
    medicinalPart: "과피",
    importance: "중요",
    category: "과실류",
    family: { koreanName: "운향과", scientificName: "Rutaceae" },
    sections: [{
      id: "section",
      fieldDefinitionId: "field",
      title: "옛 제목",
      items: [{ id: "item", text: "Hesperidin", html: "<strong>Hesperidin</strong>", linkedConstituentId: "internal-id" }],
    }],
    fieldNames: new Map([["field", "성분"]]),
    relationships: [{ targetKoreanName: "청피", type: "연관생약", notes: null }],
    identityTerms: ["포제"],
    mnemonic: {
      items: [{ id: "mnemonic-item", text: "귤껍질" }],
      blocks: [{ id: "mnemonic-text", type: "text", content: { text: "기억 본문", html: "<em>기억 본문</em>" } }],
    },
  });

  assert.equal(payload.replaceExisting, true);
  assert.equal(payload.drugs[0].sections?.[0].field, "성분");
  assert.deepEqual(payload.drugs[0].sections?.[0].items[0], { text: "Hesperidin", html: "<strong>Hesperidin</strong>" });
  assert.equal(payload.drugs[0].mnemonic?.text?.text, "기억 본문");
  assert.equal(pharmacognosyImportV1Schema.safeParse(JSON.parse(JSON.stringify(payload))).success, true);
});

test("manual-save JSON records nullable links and removes blank editor placeholders", () => {
  const payload = buildDataCardImport({
    koreanName: "미분류 생약",
    latinName: null,
    origin: null,
    origins: [],
    scientificName: null,
    medicinalPart: null,
    importance: "중간",
    category: null,
    family: null,
    sections: [{ id: "section", title: "효능", items: [{ id: "blank", text: "", children: [{ id: "child", text: "유효 내용" }] }] }],
    fieldNames: new Map(),
    relationships: [],
    identityTerms: [],
  });

  assert.equal(payload.drugs[0].category, null);
  assert.equal(payload.drugs[0].family, null);
  assert.deepEqual(payload.drugs[0].sections?.[0].items, [{ text: "유효 내용" }]);
});
