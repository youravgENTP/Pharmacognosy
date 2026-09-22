import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("Day Mode keeps authored content neutral, uses a botanical sidebar, and styles existing Identification actions only", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /:root\[data-theme="day"\][\s\S]*--sidebar-bg:\s*#234f3b/);
  assert.match(css, /--user-content-text:\s*#202124/);
  assert.match(css, /:root\[data-theme="day"\] h1 \{ color: #194a34; \}/);
  assert.match(css, /:root\[data-theme="day"\] \.origin-add,[\s\S]*\.inline-add/);
  const editor = readFileSync(join(process.cwd(), "components/drug-editor.tsx"), "utf8");
  assert.match(editor, /className="origin-add" onClick=/);
  assert.match(editor, /className="inline-add" onClick=/);
});
