import assert from "node:assert/strict";
import test from "node:test";
import type { StudySection } from "@/lib/db/schema";
import { assignmentForUser, assignmentNameVariants, mnemonicAssignments } from "@/lib/mnemonic-assignments";
import { calculateMnemonicProgress, hasMnemonicContent } from "@/lib/mnemonic-progress";

const shell = (id: string, title: string, fieldDefinitionId?: string): StudySection => ({ id, title, fieldDefinitionId, items: [], blocks: [] });

test("assignment names match full display names and alternate card labels", () => {
  assert.equal(assignmentForUser("이은재")?.label, "은재");
  assert.equal(assignmentForUser("윤형진")?.label, "형진");
  assert.equal(assignmentForUser("숭숭라이드")?.label, "서현");
  assert.equal(assignmentForUser("윤형진_2"), undefined);
  assert.deepEqual(assignmentNameVariants("육종용(열당)"), ["육종용열당", "육종용"]);
  assert.ok(assignmentNameVariants("홉·호프").includes("홉"));
  assert.ok(assignmentNameVariants("홉,호프").includes("호프"));
  assert.ok(mnemonicAssignments.every((assignment) => new Set(assignment.drugs).size === assignment.drugs.length));
});

test("assignment matching tolerates database-only parenthetical labels", () => {
  const progress = calculateMnemonicProgress(
    { label: "테스트", userNames: ["테스트"], drugs: ["귤핵", "홉·호프"] },
    [
      { id: "a", koreanName: "귤핵 (종자류)", sections: [shell("a-shell", "암기법")] },
      { id: "b", koreanName: "홉,호프", sections: [shell("b-shell", "성분")] },
    ],
    [],
  );
  assert.equal(progress.missingCards.length, 0);
  assert.equal(progress.required, 1);
  assert.equal(progress.excluded, 1);
});

test("progress excludes cards without a mnemonic field and counts meaningful user content", () => {
  const assignment = { label: "테스트", userNames: ["테스트"], drugs: ["가", "나", "다", "없는 카드"] };
  const fields = new Map([["mnemonic-field", "암기법"]]);
  const drugs = [
    { id: "a", koreanName: "가", sections: [shell("a-shell", "암기법")] },
    { id: "b", koreanName: "나", sections: [shell("b-shell", "기존 제목", "mnemonic-field")] },
    { id: "c", koreanName: "다", sections: [shell("c-shell", "성분")] },
  ];
  const progress = calculateMnemonicProgress(assignment, drugs, [{ drugId: "a", items: [{ id: "item", text: "기억 내용" }], blocks: [] }], fields);
  assert.deepEqual(progress, {
    assignmentLabel: "테스트", assigned: 4, required: 2, completed: 1, remaining: 1, excluded: 1, percent: 50,
    incomplete: [{ id: "b", name: "나" }], missingCards: ["없는 카드"],
  });
});

test("empty mnemonic shells are incomplete while text and images are complete", () => {
  assert.equal(hasMnemonicContent([{ id: "empty", text: "  " }], []), false);
  assert.equal(hasMnemonicContent([], [{ id: "text", type: "text", content: { text: "설명" } }]), true);
  assert.equal(hasMnemonicContent([], [{ id: "image", type: "image", mediaAssetId: "asset", size: "small" }]), true);
});
