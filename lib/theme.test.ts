import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { isThemeMode, THEME_INITIALIZER } from "@/lib/theme";

function initialize(saved: string | null) {
  const documentElement = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  vm.runInNewContext(THEME_INITIALIZER, {
    document: { documentElement },
    localStorage: { getItem: () => saved },
  });
  return documentElement;
}

test("theme values are limited to day and night", () => {
  assert.equal(isThemeMode("day"), true);
  assert.equal(isThemeMode("night"), true);
  assert.equal(isThemeMode("system"), false);
});

test("initial theme defaults to night for existing users", () => {
  assert.deepEqual(initialize(null), { dataset: { theme: "night" }, style: { colorScheme: "dark" } });
});

test("initial theme restores both persisted modes before rendering", () => {
  assert.deepEqual(initialize("day"), { dataset: { theme: "day" }, style: { colorScheme: "light" } });
  assert.deepEqual(initialize("night"), { dataset: { theme: "night" }, style: { colorScheme: "dark" } });
});
