import assert from "node:assert/strict";
import test from "node:test";
import { buildHerbSearchDocument, getHerbSearchMatches, normalizeSearchText } from "@/lib/herb-search";

const herb = buildHerbSearchDocument({
  index: "12",
  koreanName: "진피",
  latinName: "Citri Unshius Pericarpium",
  scientificName: "Citrus unshiu",
  origin: "귤나무의 완숙과 과피",
  origins: [{ nameKo: "귤나무", scientificName: "Citrus unshiu" }],
  medicinalPart: "잘 익은 열매껍질",
  categoryName: "과실류",
  family: { koreanName: "운향과", scientificName: "Rutaceae", acceptedScientificName: null },
  sections: [
    { id: "component", title: "성분", items: [{ id: "item", text: "Flavonoid", children: [{ id: "child", text: "Hesperidin" }] }] },
    { id: "pharmacology", title: "약리", items: [{ id: "effect", text: "건위 작용" }] },
    { id: "caution", title: "주의·부작용·독성", items: [], blocks: [{ id: "text", type: "text", content: { text: "과량 복용 주의" } }] },
    { id: "product", title: "처방·생약유래 의약품", items: [{ id: "drug", text: "진피 배합 제제" }] },
  ],
  constituents: [{ name: "Hesperidin", aliases: ["Hesperidoside"], taxa: ["Flavonoid"] }],
  identityTerms: ["초숙과와 구별"],
  relationships: [{ type: "유사생약", drugName: "청피", notes: "미숙과" }],
});

test("Herb search normalizes case, whitespace, and Korean text", () => {
  assert.equal(normalizeSearchText("  RuTaCeAe  "), "rutaceae");
  assert.equal(getHerbSearchMatches(herb, " RUTACEAE ").matches[0].label, "Family");
  assert.equal(getHerbSearchMatches(herb, "운향과").matches[0].label, "Family");
});

test("Herb search covers compounds, taxonomy, pharmacology, cautions, products, identity, and relationships", () => {
  const cases = [
    ["hesperidin", "성분"], ["flavonoid", "성분"], ["건위", "약리"], ["과량", "주의·부작용·독성"],
    ["배합 제제", "처방·생약유래 의약품"], ["초숙과", "가공 및 기타 사항"], ["청피", "유사생약"], ["미숙과", "유사생약"],
  ];
  for (const [query, label] of cases) assert.ok(getHerbSearchMatches(herb, query).matches.some((match) => match.label === label), `${query} should match ${label}`);
});

test("Herb search returns one ranked result document with meaningful match reasons only", () => {
  const exact = getHerbSearchMatches(herb, "진피");
  const partial = getHerbSearchMatches(herb, "Citri");
  const family = getHerbSearchMatches(herb, "운향과");
  const component = getHerbSearchMatches(herb, "hesperidin");
  assert.ok(exact.score < partial.score && partial.score < family.score && family.score < component.score);
  assert.deepEqual(exact.matches[0], { label: "생약명", text: "진피" });
  assert.equal(herb.entries.some((entry) => /(?:^|\W)(?:id|component)(?:$|\W)/i.test(entry.text)), false);
});
