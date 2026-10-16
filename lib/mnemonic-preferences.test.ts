import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalMnemonic } from "@/lib/mnemonic-preferences";

const version = (userId: string, userName: string, text = userId) => ({ userId, userName, items: [{ id: `${userId}-item`, text }], blocks: [] });

test("one mnemonic without a preference resolves deterministically", () => {
  const only = version("author", "작성자");
  assert.deepEqual(resolveCanonicalMnemonic("viewer", [only]), { mnemonic: only, preferredMnemonicUserId: null, source: "fallback" });
});

test("multiple mnemonics prefer own version, then stable author ordering", () => {
  const beta = version("b", "하늘");
  const alpha = version("a", "가람");
  assert.equal(resolveCanonicalMnemonic("b", [alpha, beta]).mnemonic?.userId, "b");
  assert.equal(resolveCanonicalMnemonic("viewer", [beta, alpha]).mnemonic?.userId, "a");
  assert.equal(resolveCanonicalMnemonic("viewer", [alpha, beta]).mnemonic?.userId, "a");
});

test("an explicit personal preference may select another author", () => {
  const mine = version("viewer", "나");
  const other = version("other", "다른 작성자");
  const resolved = resolveCanonicalMnemonic("viewer", [mine, other], "other");
  assert.equal(resolved.mnemonic, other);
  assert.equal(resolved.preferredMnemonicUserId, "other");
  assert.equal(resolved.source, "explicit");
});

test("different users independently resolve different canonical versions", () => {
  const first = version("first", "첫째");
  const second = version("second", "둘째");
  assert.equal(resolveCanonicalMnemonic("viewer-a", [first, second], "first").mnemonic, first);
  assert.equal(resolveCanonicalMnemonic("viewer-b", [first, second], "second").mnemonic, second);
});

test("a deleted preferred mnemonic falls back without a stale canonical indicator", () => {
  const own = version("viewer", "나");
  const resolved = resolveCanonicalMnemonic("viewer", [own], "deleted-author");
  assert.equal(resolved.mnemonic, own);
  assert.equal(resolved.preferredMnemonicUserId, null);
  assert.equal(resolved.source, "own");
});

test("updated selected content is returned intact, including rich hierarchy", () => {
  const selected = { userId: "author", userName: "작성자", items: [{ id: "root", text: "root", html: "<strong>root</strong>", children: [{ id: "child", text: "child", italic: true }] }], blocks: [{ id: "text", type: "text" as const, content: { text: "line 1\nline 2", html: "<mark>line 1</mark><br>line 2" } }] };
  assert.equal(resolveCanonicalMnemonic("viewer", [selected], "author").mnemonic, selected);
});

test("no mnemonic produces an empty state", () => {
  assert.deepEqual(resolveCanonicalMnemonic("viewer", []), { mnemonic: undefined, preferredMnemonicUserId: null, source: "empty" });
});
