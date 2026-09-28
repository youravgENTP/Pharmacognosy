import assert from "node:assert/strict";
import test from "node:test";
import type { StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import { hierarchyMarkerForMode } from "@/lib/hierarchy-marker";
import { mergeImportedMnemonic, mergeImportedSections, prepareImport, scalarMergePatch, shouldSetMnemonicPreference, type ImportExistingDrug, type ImportFieldDefinition, type ImportMnemonicVersion } from "@/lib/import-pipeline";
import { pharmacognosyImportV1Schema } from "@/lib/import-schema";
import { studyBlockSchema } from "@/lib/validators";

const ids = { component: "10000000-0000-4000-8000-000000000001", other: "10000000-0000-4000-8000-000000000002", mnemonic: "10000000-0000-4000-8000-000000000003" };
const fields: ImportFieldDefinition[] = [
  { id: ids.component, name: "성분", inputMode: "hierarchy4", position: 10, active: true },
  { id: ids.other, name: "기타", inputMode: "hierarchy4", position: 80, active: true },
  { id: ids.mnemonic, name: "암기법", inputMode: "hierarchy4", position: 90, active: true },
];
const users = [{ id: "current", name: "현재 사용자" }, { id: "song", name: "숭숭라이드" }, { id: "lee", name: "이은재" }];
const componentSection: StudySection = { id: "component-section", fieldDefinitionId: ids.component, title: "성분", items: [{ id: "component-item", text: "old component" }] };
const otherSection: StudySection = { id: "other-section", fieldDefinitionId: ids.other, title: "기타", items: [{ id: "other-item", text: "old other" }] };
const existingDrug: ImportExistingDrug = { id: "20000000-0000-4000-8000-000000000001", koreanName: "개자", latinName: "Brassicae Semen", origin: null, origins: [], scientificName: null, medicinalPart: null, categoryId: "category", familyId: "family", importance: "중요", sections: [componentSection, otherSection] };
const oldItems: StudyItem[] = [{ id: "old-item", text: "old list" }];
const oldBlocks: StudyBlock[] = [{ id: "old-text", type: "text", content: { text: "old prose", html: "<strong>old prose</strong>" } }, { id: "old-items", type: "items", items: oldItems }];
const existingMnemonic: ImportMnemonicVersion = { drugId: existingDrug.id, userId: "song", items: oldItems, blocks: oldBlocks };

function payload(drug: Record<string, unknown>) {
  return pharmacognosyImportV1Schema.parse({ schema: "pharmacognosy.import", version: 1, drugs: [drug] });
}

function prepare(drug: Record<string, unknown>, overrides: Partial<Parameters<typeof prepareImport>[1]> = {}) {
  return prepareImport(payload(drug), { fields, existingDrugs: [existingDrug], users, currentUser: users[0], mnemonicVersions: [existingMnemonic], ...overrides });
}

test("existing drug without mnemonic produces no mnemonic mutation plan", () => {
  const prepared = prepare({ koreanName: "개자", sections: [{ field: "기타", items: [{ text: "new" }] }] });
  assert.equal(prepared.drugs[0].mnemonic, undefined);
  assert.equal(prepared.drugs[0].preview.mnemonicAction, "변경 없음");
});

test("mnemonic authorUserName resolves by exact display name", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { authorUserName: "숭숭라이드", items: [{ text: "list" }] } });
  assert.equal(prepared.drugs[0].mnemonic?.targetUserId, "song");
  assert.equal(prepared.drugs[0].preview.mnemonicAction, "숭숭라이드 암기법 업데이트 · 목록");
});

test("unknown mnemonic author is a blocking error", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { authorUserName: "없는 사용자", items: [] } });
  assert.equal(prepared.canCommit, false);
  assert.match(prepared.drugs[0].errors.find((error) => error.code === "mnemonic-author-missing")!.message, /찾을 수 없습니다/);
});

test("duplicate exact display-name authors are a blocking error", () => {
  const duplicateUsers = [...users, { id: "song-2", name: "숭숭라이드" }];
  const prepared = prepare({ koreanName: "개자", mnemonic: { authorUserName: "숭숭라이드", items: [] } }, { users: duplicateUsers });
  assert.equal(prepared.canCommit, false);
  assert.equal(prepared.drugs[0].errors.find((error) => error.code === "mnemonic-author-ambiguous")?.message, "동일한 이름의 사용자가 여러 명 있습니다.");
});

test("omitted authorUserName resolves to the authenticated current user", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { items: [{ text: "mine" }] } });
  assert.equal(prepared.drugs[0].mnemonic?.targetUserId, "current");
  assert.match(prepared.drugs[0].preview.mnemonicAction, /^현재 사용자 암기법 추가/);
});

test("third-party mnemonic targets the resolved author rather than current user", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { authorUserName: "이은재", text: { text: "prose" } } });
  assert.equal(prepared.drugs[0].mnemonic?.targetUserId, "lee");
  assert.notEqual(prepared.drugs[0].mnemonic?.targetUserId, users[0].id);
});

test("third-party mnemonic import never changes the current user's preference", () => {
  assert.equal(shouldSetMnemonicPreference("song", "current", undefined), false);
  assert.equal(shouldSetMnemonicPreference("current", "current", undefined), true);
  assert.equal(shouldSetMnemonicPreference("current", "current", existingMnemonic), false);
});

test("mnemonic text-only update preserves existing items", () => {
  const merged = mergeImportedMnemonic(existingMnemonic, { text: { text: "new prose" } }, () => "new");
  assert.deepEqual(merged.items, oldItems);
  assert.equal(merged.blocks.find((block) => block.type === "text")?.content.text, "new prose");
  assert.equal(merged.blocks.find((block) => block.type === "items")?.items[0].text, "old list");
});

test("mnemonic items-only update preserves existing prose", () => {
  const merged = mergeImportedMnemonic(existingMnemonic, { items: [{ text: "new list" }] }, () => "new");
  assert.equal(merged.blocks.find((block) => block.type === "text")?.content.text, "old prose");
  assert.equal(merged.items[0].text, "new list");
});

test("mnemonic text and items update together", () => {
  const merged = mergeImportedMnemonic(existingMnemonic, { text: { text: "new prose" }, items: [{ text: "new list" }] }, () => "new");
  assert.equal(merged.blocks[0].type === "text" && merged.blocks[0].content.text, "new prose");
  assert.equal(merged.items[0].text, "new list");
});

test("mnemonic prose preserves normalized font color", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { text: { text: "red prose", html: '<span style="color:#c00000">red</span> prose' } } });
  assert.equal(prepared.drugs[0].input.mnemonic?.text?.html, '<span style="color:#C00000">red</span> prose');
});

test("mnemonic prose preserves line breaks", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { text: { text: "line 1\nline 2", html: "line 1<br>line 2" } } });
  assert.equal(prepared.drugs[0].input.mnemonic?.text?.text, "line 1\nline 2");
  assert.equal(prepared.drugs[0].input.mnemonic?.text?.html, "line 1<br>line 2");
});

test("mnemonic prose text/html mismatch blocks import", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { text: { text: "A", html: "<strong>B</strong>" } } });
  assert.equal(prepared.canCommit, false);
  assert.ok(prepared.drugs[0].errors.some((error) => error.code === "rich-text-mismatch"));
});

test("mnemonic explanation items preserve rich text", () => {
  const prepared = prepare({ koreanName: "개자", mnemonic: { items: [{ text: "red", html: '<span style="color:#c00000">red</span>' }] } });
  assert.equal(prepared.drugs[0].input.mnemonic?.items?.[0].html, '<span style="color:#C00000">red</span>');
});

test("mnemonic explanation validation always uses hierarchy3", () => {
  const depth4 = [{ text: "1", children: [{ text: "2", children: [{ text: "3", children: [{ text: "4" }] }] }] }];
  const prepared = prepare({ koreanName: "개자", mnemonic: { items: depth4 } });
  assert.equal(prepared.drugs[0].errors.find((error) => error.code === "hierarchy-overflow")?.destinationMode, "hierarchy3");
});

test("hierarchy3 mnemonic top-level marker is circled one", () => {
  assert.equal(hierarchyMarkerForMode(0, 0, "hierarchy3"), "①");
  assert.equal(hierarchyMarkerForMode(1, 0, "hierarchy3"), "a)");
  assert.equal(hierarchyMarkerForMode(2, 0, "hierarchy3"), "•");
});

test("mnemonic prose block has no hierarchy marker", () => {
  const merged = mergeImportedMnemonic(undefined, { text: { text: "plain prose" } }, () => "text-id");
  assert.deepEqual(merged.blocks[0], { id: "text-id", type: "text", content: { text: "plain prose" } });
});

test("omitted category and importance stay out of the scalar patch", () => {
  const input = payload({ koreanName: "개자", mnemonic: { items: [] } }).drugs[0];
  const patch = scalarMergePatch(input, {});
  assert.equal(Object.hasOwn(patch, "categoryId"), false);
  assert.equal(Object.hasOwn(patch, "importance"), false);
});

test("omitted family stays out of the scalar patch", () => {
  const input = payload({ koreanName: "개자", sections: [] }).drugs[0];
  assert.equal(Object.hasOwn(scalarMergePatch(input, {}), "familyId"), false);
});

test("omitted unrelated sections are preserved", () => {
  const prepared = prepare({ koreanName: "개자", sections: [{ field: "기타", items: [{ text: "new other" }] }] });
  const merged = mergeImportedSections(existingDrug.sections, prepared.drugs[0].sections, fields);
  assert.equal(merged.find((section) => section.title === "성분")?.items[0].text, "old component");
});

test("omitted relationships produce no relationship mutations", () => {
  assert.deepEqual(prepare({ koreanName: "개자", mnemonic: { items: [] } }).drugs[0].relationships, []);
});

test("omitted identityTerms remain absent from normalized input", () => {
  assert.equal(prepare({ koreanName: "개자", mnemonic: { items: [] } }).drugs[0].input.identityTerms, undefined);
});

test("importing one section replaces only that matching section", () => {
  const prepared = prepare({ koreanName: "개자", sections: [{ field: "기타", items: [{ text: "new other" }] }] });
  const merged = mergeImportedSections(existingDrug.sections, prepared.drugs[0].sections, fields, false, () => "new-id");
  assert.equal(merged.find((section) => section.title === "기타")?.id, "other-section");
  assert.equal(merged.find((section) => section.title === "기타")?.items[0].text, "new other");
  assert.equal(merged.find((section) => section.title === "성분")?.id, "component-section");
});

test("legacy mnemonic items-only schema remains backwards compatible", () => {
  const parsed = payload({ koreanName: "개자", mnemonic: { items: [{ text: "legacy" }] } });
  assert.equal(parsed.drugs[0].mnemonic?.items?.[0].text, "legacy");
});

test("mnemonic schema rejects author-only objects", () => {
  const parsed = pharmacognosyImportV1Schema.safeParse({ schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "개자", mnemonic: { authorUserName: "숭숭라이드" } }] });
  assert.equal(parsed.success, false);
});

test("legacy StudyBlock item and image data remains readable", () => {
  assert.equal(studyBlockSchema.safeParse({ id: "items", type: "items", items: oldItems }).success, true);
  assert.equal(studyBlockSchema.safeParse({ id: "image", type: "image", mediaAssetId: "10000000-0000-4000-8000-000000000099", size: "medium" }).success, true);
});

test("new StudyBlock text data validates without a migration", () => {
  assert.equal(studyBlockSchema.safeParse({ id: "text", type: "text", content: { text: "line 1\nline 2", html: "line 1<br>line 2" } }).success, true);
});
