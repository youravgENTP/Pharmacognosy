import type { FieldInputMode } from "@/lib/db/schema";

export function hierarchyMarkerForMode(depth: number, index: number, mode: Exclude<FieldInputMode, "text">) {
  const adjusted = mode === "hierarchy3" ? depth + 1 : depth;
  if (adjusted === 0) return `${toRoman(index + 1).toLowerCase()})`;
  if (adjusted === 1) return index < 20 ? String.fromCodePoint(0x2460 + index) : `(${index + 1})`;
  if (adjusted === 2) return `${String.fromCharCode(97 + (index % 26))})`;
  return "•";
}

function toRoman(value: number) {
  const pairs: [number, string][] = [[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let number = value, result = "";
  for (const [amount, symbol] of pairs) while (number >= amount) { result += symbol; number -= amount; }
  return result;
}
