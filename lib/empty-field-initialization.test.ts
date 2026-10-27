import assert from "node:assert/strict";
import test from "node:test";
import { appendEmptyFieldSections, classifyEmptyDataCard, createEmptyFieldSections, type InitializableDrug, type InitializableField } from "@/lib/empty-field-initialization";

const fields: InitializableField[] = [
  { id: "field-a", name: "성분", inputMode: "hierarchy4", position: 10, active: true },
  { id: "field-b", name: "약리", inputMode: "hierarchy4", position: 40, active: true },
];
const drug = (patch: Partial<InitializableDrug> = {}): InitializableDrug => ({ id: "drug", koreanName: "기말생약", categoryName: "피류", catalogIndex: 10, referenceIndex: null, archived: false, sections: [], ...patch });

test("a new final-exam drug with sections [] receives ordered empty active fields", () => {
  const result = classifyEmptyDataCard(drug(), fields);
  assert.equal(result.status, "initialize");
  assert.deepEqual(createEmptyFieldSections(fields, (() => { let id = 0; return () => `section-${++id}`; })()), [
    { id: "section-1", fieldDefinitionId: "field-a", title: "성분", items: [], blocks: [] },
    { id: "section-2", fieldDefinitionId: "field-b", title: "약리", items: [], blocks: [] },
  ]);
});

test("a card with an existing active empty field is already initialized", () => {
  assert.equal(classifyEmptyDataCard(drug({ sections: [{ id: "s", fieldDefinitionId: "field-a", title: "성분", items: [], blocks: [] }] }), fields).status, "already-initialized");
});

test("a card with an existing active field and notes is counted as content-protected", () => {
  assert.equal(classifyEmptyDataCard(drug({ sections: [{ id: "s", fieldDefinitionId: "field-a", title: "성분", items: [{ id: "i", text: "필기" }], blocks: [] }] }), fields).status, "excluded-content");
});

test("text notes exclude a card from automatic initialization", () => {
  assert.equal(classifyEmptyDataCard(drug({ sections: [{ id: "legacy", title: "옛 필드", items: [{ id: "i", text: "사용자 필기" }], blocks: [] }] }), fields).status, "excluded-content");
});

test("HTML, text blocks, and images are treated as substantive content", () => {
  const blocks = [
    [{ id: "s", title: "옛 필드", items: [], blocks: [{ id: "b", type: "text", content: { text: "", html: "<b>필기</b>" } }] }],
    [{ id: "s", title: "옛 필드", items: [], blocks: [{ id: "b", type: "image", mediaAssetId: "asset", size: "large" }] }],
  ];
  for (const sections of blocks) assert.equal(classifyEmptyDataCard(drug({ sections }), fields).status, "excluded-content");
});

test("meaningful user mnemonic content excludes an otherwise empty card", () => {
  assert.equal(classifyEmptyDataCard(drug({ mnemonicItems: [{ id: "m", text: "암기" }] }), fields).status, "excluded-content");
});

test("Archive, reference, and midterm drugs stay out of scope", () => {
  assert.equal(classifyEmptyDataCard(drug({ archived: true }), fields).status, "out-of-scope");
  assert.equal(classifyEmptyDataCard(drug({ catalogIndex: null, referenceIndex: 1 }), fields).status, "out-of-scope");
  assert.equal(classifyEmptyDataCard(drug({ categoryName: "과실류" }), fields).status, "out-of-scope");
});

test("initialization is idempotent and preserves pre-existing empty legacy sections", () => {
  const legacy = { id: "legacy", title: "비활성 필드", items: [], blocks: [] };
  const first = appendEmptyFieldSections([legacy], fields, (() => { let id = 0; return () => `new-${++id}`; })());
  assert.deepEqual(first[0], legacy);
  assert.equal(classifyEmptyDataCard(drug({ sections: first }), fields).status, "already-initialized");
  assert.equal(appendEmptyFieldSections(first, fields).length, first.length);
});

test("content added after Preview changes the Commit-time classification", () => {
  assert.equal(classifyEmptyDataCard(drug(), fields).status, "initialize");
  assert.equal(classifyEmptyDataCard(drug({ sections: [{ id: "new", title: "임시", items: [], blocks: [{ id: "t", type: "text", content: { text: "방금 입력", html: "" } }] }] }), fields).status, "excluded-content");
});
