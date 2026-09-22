import assert from "node:assert/strict";
import test from "node:test";
import { parseInlineRuns } from "@/lib/rich-text";

test("nested inline formats restore the outer state", () => {
  assert.deepEqual(parseInlineRuns('<strong>A<u>B<sup>C</sup></u>D</strong>E', ""), [
    { text: "A", bold: true },
    { text: "B", bold: true, underline: true },
    { text: "C", bold: true, underline: true, superscript: true },
    { text: "D", bold: true },
    { text: "E" },
  ]);
});

test("span styles map to semantic export runs", () => {
  assert.deepEqual(parseInlineRuns('<span style="color: rgb(1, 2, 3); background-color: #ffee00; text-decoration: underline line-through; letter-spacing: 0.08em">X</span>', ""), [{
    text: "X", color: "rgb(1, 2, 3)", highlight: "#ffee00", underline: true, strike: true, characterSpacing: "wide",
  }]);
});
