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

test("Day Mode keeps authored content neutral and uses a botanical sidebar", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /:root\[data-theme="day"\][\s\S]*--sidebar-bg:\s*#234f3b/);
  assert.match(css, /--user-content-text:\s*#202124/);
  assert.match(css, /:root\[data-theme="day"\] h1 \{ color: #194a34; \}/);
  assert.match(css, /:root\[data-theme="day"\] \.origin-add,[\s\S]*\.inline-add/);
  const editor = readFileSync(join(process.cwd(), "components/drug-editor.tsx"), "utf8");
  assert.match(editor, /className="origin-add" onClick=/);
  assert.match(editor, /className="inline-add" onClick=/);
});

test("shared controls use theme tokens instead of a fixed dark palette", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const controls = css.slice(css.indexOf("/* Theme-aware controls shared by modals, pickers, exports, and settings. */"));

  assert.match(css, /:root,\s*:root\[data-theme="night"\][\s\S]*--control-bg:\s*#20252b/);
  assert.match(css, /:root\[data-theme="day"\][\s\S]*--control-bg:\s*#f7f9f6/);
  assert.match(controls, /\.modal-close,[\s\S]*\.save-status,[\s\S]*background:\s*var\(--control-bg\)/);
  assert.match(controls, /\.collection-kind-picker > button,[\s\S]*background:\s*var\(--control-bg\)/);
  assert.match(controls, /\.collection-export-button,[\s\S]*\.data-card-export[\s\S]*background:\s*var\(--control-accent-bg\)/);
  assert.match(controls, /\.data-export-submit:disabled[\s\S]*background:\s*var\(--control-disabled-bg\)/);
  assert.match(controls, /\.constituent-delete,[\s\S]*background:\s*var\(--control-danger-bg\)/);
});
