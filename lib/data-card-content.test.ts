import assert from "node:assert/strict";
import test from "node:test";
import { assessDataCardVerification, compareDataCardContent, normalizeStudySections, type ComparableDataCard } from "./data-card-content";
import { dataCardContentHash } from "./data-card-integrity";
import { drugPatchSchema } from "./validators";

const fieldId = "10000000-0000-4000-8000-000000000001";
const mediaId = "20000000-0000-4000-8000-000000000002";

function richCard(): ComparableDataCard {
  return {
    koreanName: "센나엽",
    latinName: "Sennae Folium",
    origin: null,
    origins: [{ nameKo: "센나", scientificName: "Senna alexandrina" }],
    scientificName: "Senna alexandrina Mill.",
    medicinalPart: "소엽",
    familyId: null,
    importance: "중요",
    sections: [{
      id: "section-study",
      title: "Study Section",
      fieldDefinitionId: fieldId,
      items: [{ id: "root", text: "사하작용", html: "<b>사하작용</b>", children: [{ id: "child", text: "sennoside", html: "<i>sennoside</i>" }] }],
      blocks: [
        { id: "prose", type: "text", content: { text: "복용법", html: "<p>복용법</p>" } },
        { id: "hierarchy", type: "items", items: [{ id: "block-root", text: "성분", children: [{ id: "block-child", text: "sennoside A" }] }] },
        { id: "image", type: "image", mediaAssetId: mediaId, size: "large", widthPercent: 72, xPercent: 9, yPx: 14, anchorItemId: "root", anchorSide: "after", align: "center" },
      ],
    }],
  };
}

test("PATCH JSON round-trip and intentional mnemonic storage normalization verify semantically", () => {
  const expected = richCard();
  expected.sections.push({ id: "mnemonic", title: "암기법", items: [{ id: "legacy", text: "별도 API 소유 콘텐츠" }], blocks: [] });
  expected.sections[0]!.blocks![0] = { ...expected.sections[0]!.blocks![0]!, content: { text: "복용법", html: undefined } } as never;
  const parsed = drugPatchSchema.parse({ baseRevision: 64, ...JSON.parse(JSON.stringify(expected)) });
  const stored = { ...parsed, sections: normalizeStudySections(parsed.sections ?? []) } as ComparableDataCard & { baseRevision: number };
  assert.equal(compareDataCardContent(expected, stored).equal, true);
  assert.equal(dataCardContentHash(expected), dataCardContentHash(stored), "shared semantic normalization must also drive the content hash");
});

test("PATCH validation preserves text, HTML, hierarchy, image layout, order, and forward-compatible fields", () => {
  const input = richCard() as ComparableDataCard & { sections: Array<Record<string, unknown>> };
  input.sections[0]!.futureSectionFlag = "keep";
  const blocks = input.sections[0]!.blocks as Array<Record<string, unknown>>;
  blocks[0]!.futureTextFlag = "keep";
  blocks[1]!.futureItemsFlag = "keep";
  blocks[2]!.futureImageFlag = "keep";
  const output = drugPatchSchema.parse({ baseRevision: 64, ...input });
  assert.deepEqual(output.sections, input.sections);
  assert.deepEqual((output.sections![0]!.blocks ?? []).map((block) => block.id), ["prose", "hierarchy", "image"]);
});

test("verification detects non-mnemonic data loss with stable field paths", () => {
  const expected = richCard();
  const actual = structuredClone(expected);
  actual.sections[0]!.items[0]!.children![0]!.html = "<i>lost</i>";
  actual.sections[0]!.blocks![2] = { ...actual.sections[0]!.blocks![2]!, mediaAssetId: "30000000-0000-4000-8000-000000000003" } as never;
  const result = compareDataCardContent(expected, actual);
  assert.equal(result.equal, false);
  assert.ok(result.differences.includes("sections[id=section-study].items[id=root].children[id=child].html"));
  assert.ok(result.differences.includes("sections[id=section-study].blocks[id=image].mediaAssetId"));
});

test("verification detects Study Section and block ordering changes", () => {
  const expected = richCard();
  expected.sections.push({ id: "second", title: "확인", items: [], blocks: [] });
  const actual = structuredClone(expected);
  actual.sections.reverse();
  actual.sections[1]!.blocks!.reverse();
  const result = compareDataCardContent(expected, actual);
  assert.ok(result.differences.includes("sections.$order"));
  assert.ok(result.differences.includes("sections[id=section-study].blocks.$order"));
});

test("post-save verification classifies success, mismatch, stale responses, and a new revision conflict", () => {
  const expected = richCard();
  assert.equal(assessDataCardVerification(expected, 65, 65, structuredClone(expected)).status, "verified");
  const changed = structuredClone(expected); changed.sections[0]!.items[0]!.text = "remote change";
  assert.equal(assessDataCardVerification(expected, 65, 65, changed).status, "content-mismatch");
  assert.equal(assessDataCardVerification(expected, 65, 64, expected).status, "stale-response");
  assert.equal(assessDataCardVerification(expected, 65, 66, changed).status, "revision-reconflict");
});
