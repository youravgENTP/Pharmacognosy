import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sameDataCard, threeWayMerge, type DataCardContent } from "./data-card-merge";
import type { StudyBlock, StudyItem } from "./db/schema";

const item = (id: string, text: string, children: StudyItem[] = []): StudyItem => ({ id, text, children });
const section = (items = [item("a", "A"), item("b", "B")], blocks: DataCardContent["sections"][number]["blocks"] = []) => ({ id: "section-1", title: "약리", items, blocks });
const card = (): DataCardContent => ({ koreanName: "감초", latinName: "Glycyrrhizae Radix", origin: null, origins: [], scientificName: null, medicinalPart: "뿌리", familyId: null, importance: "중간", sections: [section()] });

test("different primitive fields are automatically merged", () => {
  const base = card(); const local = structuredClone(base); const remote = structuredClone(base);
  local.latinName = "Local"; remote.medicinalPart = "Remote";
  const result = threeWayMerge(base, local, remote);
  assert.equal(result.unresolved, 0); assert.equal(result.value.latinName, "Local"); assert.equal(result.value.medicinalPart, "Remote");
});

test("server JSON object key ordering does not cause a false verification failure", () => {
  const local = card();
  const remote = Object.fromEntries(Object.entries(local).reverse()) as DataCardContent;
  assert.equal(sameDataCard(local, remote), true);
});

test("different values for the same primitive require an explicit choice", () => {
  const base = card(); const local = { ...base, importance: "중요" as const }; const remote = { ...base, importance: "비중요" as const };
  const pending = threeWayMerge(base, local, remote);
  assert.equal(pending.unresolved, 1); assert.equal(pending.conflicts[0]?.path, "importance");
  assert.equal(threeWayMerge(base, local, remote, { importance: "local" }).value.importance, "중요");
  assert.equal(threeWayMerge(base, local, remote, { importance: "remote" }).value.importance, "비중요");
});

test("different nodes merge while the same node property conflicts", () => {
  const base = card(); const local = structuredClone(base); const remote = structuredClone(base);
  local.sections[0]!.items[0]!.text = "local A"; remote.sections[0]!.items[1]!.text = "remote B";
  const automatic = threeWayMerge(base, local, remote);
  assert.equal(automatic.unresolved, 0); assert.deepEqual(automatic.value.sections[0]!.items.map((entry) => entry.text), ["local A", "remote B"]);
  remote.sections[0]!.items[0]!.text = "remote A";
  const conflict = threeWayMerge(base, local, remote);
  assert.ok(conflict.conflicts.some((entry) => entry.path.endsWith("[id=a].text")));
});

test("node deletion versus modification is a conflict", () => {
  const base = card(); const local = structuredClone(base); const remote = structuredClone(base);
  local.sections[0]!.items = local.sections[0]!.items.filter((entry) => entry.id !== "a"); remote.sections[0]!.items[0]!.text = "changed";
  const result = threeWayMerge(base, local, remote);
  assert.equal(result.conflicts.find((entry) => entry.path.includes("id=a"))?.kind, "delete-modify");
});

test("one-sided order changes merge and incompatible concurrent order changes conflict", () => {
  const base = card(); base.sections[0]!.items.push(item("c", "C"));
  const local = structuredClone(base); const remote = structuredClone(base);
  local.sections[0]!.items = [local.sections[0]!.items[1]!, local.sections[0]!.items[0]!, local.sections[0]!.items[2]!];
  assert.deepEqual(threeWayMerge(base, local, remote).value.sections[0]!.items.map((entry) => entry.id), ["b", "a", "c"]);
  remote.sections[0]!.items = [remote.sections[0]!.items[0]!, remote.sections[0]!.items[2]!, remote.sections[0]!.items[1]!];
  assert.ok(threeWayMerge(base, local, remote).conflicts.some((entry) => entry.kind === "order"));
});

test("independent additions and one-sided parent moves preserve structure", () => {
  const base = card(); const local = structuredClone(base); const remote = structuredClone(base);
  local.sections[0]!.items.splice(1, 0, item("local", "L")); remote.sections[0]!.items.push(item("remote", "R"));
  const added = threeWayMerge(base, local, remote);
  assert.equal(added.unresolved, 0); assert.deepEqual(new Set(added.value.sections[0]!.items.map((entry) => entry.id)), new Set(["a", "b", "local", "remote"]));
  const treeBase = card(); treeBase.sections[0]!.items = [item("parent", "P", [item("child", "C")]), item("target", "T")];
  const treeLocal = structuredClone(treeBase); const treeRemote = structuredClone(treeBase);
  const moved = treeLocal.sections[0]!.items[0]!.children!.pop()!; treeLocal.sections[0]!.items[1]!.children = [moved];
  const merged = threeWayMerge(treeBase, treeLocal, treeRemote);
  assert.equal(merged.unresolved, 0); assert.equal(merged.value.sections[0]!.items[1]!.children?.[0]?.id, "child");
});

test("image changes use block and media asset IDs and deletion does not touch assets", () => {
  const base = card(); base.sections[0]!.blocks = [{ id: "image-1", type: "image", mediaAssetId: "00000000-0000-4000-8000-000000000001", size: "medium" }];
  const local = structuredClone(base); const remote = structuredClone(base);
  local.sections[0]!.blocks![0] = { ...local.sections[0]!.blocks![0]!, size: "large" } as StudyBlock;
  remote.sections[0]!.blocks = [];
  const result = threeWayMerge(base, local, remote);
  assert.equal(result.conflicts.find((entry) => entry.path.includes("image-1"))?.kind, "delete-modify");
  assert.equal(result.conflicts[0]?.local && (result.conflicts[0].local as { mediaAssetId: string }).mediaAssetId, "00000000-0000-4000-8000-000000000001");
});

test("keep both is offered only for safely append-only unkeyed content", () => {
  const base = card(); base.origins = [{ nameKo: "기원", scientificName: "Base" }];
  const local = structuredClone(base); const remote = structuredClone(base);
  local.origins.push({ nameKo: "로컬", scientificName: "Local" }); remote.origins.push({ nameKo: "서버", scientificName: "Remote" });
  const pending = threeWayMerge(base, local, remote);
  assert.equal(pending.conflicts[0]?.canKeepBoth, true); assert.equal(pending.unresolved, 1);
  const merged = threeWayMerge(base, local, remote, { origins: "both" });
  assert.equal(merged.unresolved, 0); assert.deepEqual(merged.value.origins.map((entry) => entry.nameKo), ["기원", "로컬", "서버"]);
});

test("conflict recovery sources preserve base content, stop retries, and verify merged server content", async () => {
  const editor = await readFile(new URL("../components/drug-editor.tsx", import.meta.url), "utf8");
  const revisions = await readFile(new URL("../app/api/drugs/[id]/revisions/route.ts", import.meta.url), "utf8");
  assert.match(editor, /baseDraft\?: DrugDraft/); assert.match(editor, /if \(conflictActive\.current\)/); assert.match(editor, /sameDataCard\(value, verified\.remote\)/);
  assert.match(editor, /setMergeVisible\(false\)/); assert.match(revisions, /dataCardRevisions\.revision/); assert.match(revisions, /baseAvailable/);
});
