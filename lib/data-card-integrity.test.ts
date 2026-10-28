import assert from "node:assert/strict";
import test from "node:test";
import { dataCardContentHash } from "@/lib/data-card-integrity";

const card = { koreanName: "감초", latinName: "Glycyrrhizae Radix", origin: null, origins: [], scientificName: null, medicinalPart: "뿌리", familyId: null, importance: "중요", sections: [{ id: "section", title: "성분", items: [{ id: "item", text: "glycyrrhizin" }] }] };

test("Data Card semantic hash preserves array order and ignores object key order", () => {
  assert.equal(dataCardContentHash(card), dataCardContentHash({ sections: card.sections, importance: card.importance, familyId: null, medicinalPart: "뿌리", scientificName: null, origins: [], origin: null, latinName: card.latinName, koreanName: card.koreanName }));
  assert.notEqual(dataCardContentHash(card), dataCardContentHash({ ...card, sections: [{ ...card.sections[0], items: [{ id: "other", text: "glycyrrhizin" }] }] }));
});
