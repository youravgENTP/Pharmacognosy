import assert from "node:assert/strict";
import test from "node:test";
import { importExample, pharmacognosyImportV1Schema } from "@/lib/import-schema";

test("Import Schema v1 accepts the downloadable editor example", () => {
  const parsed = pharmacognosyImportV1Schema.parse(importExample);
  assert.equal(parsed.schema, "pharmacognosy.import");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.drugs[0].sections[0].items[0].children?.[0].text, "Hesperidin (정량성분)");
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
