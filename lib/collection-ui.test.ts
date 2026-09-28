import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Collection cards omit the legacy member picker", () => {
  const source = readFileSync(join(process.cwd(), "components/collections-manager.tsx"), "utf8");
  assert.doesNotMatch(source, /기존 그룹 멤버 추가/);
  assert.doesNotMatch(source, /function addMember/);
});

test("Collection workspace exports each kind with its native Office format", () => {
  const source = readFileSync(join(process.cwd(), "components/collection-workspace.tsx"), "utf8");
  assert.match(source, /initial\.kind === "spreadsheet" \? "xlsx" : "docx"/);
  assert.match(source, /"Export XLSX" : "Export DOCX"/);
  assert.doesNotMatch(source, /Export PDF/);
});
