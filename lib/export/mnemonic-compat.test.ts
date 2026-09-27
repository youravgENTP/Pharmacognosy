import assert from "node:assert/strict";
import test from "node:test";
import { isMissingPreferenceTable } from "@/lib/export/mnemonic-compat";

test("only a missing mnemonic preference relation activates compatibility fallback", () => {
  assert.equal(isMissingPreferenceTable({ cause: { code: "42P01", message: 'relation "user_mnemonic_preferences" does not exist' } }), true);
  assert.equal(isMissingPreferenceTable({ cause: { code: "42P01", message: 'relation "other_table" does not exist' } }), false);
  assert.equal(isMissingPreferenceTable({ cause: { code: "ECONNRESET", message: "connection reset" } }), false);
});
