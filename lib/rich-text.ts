export type CharacterSpacing = "tight" | "normal" | "wide";

export type InlineTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
  highlight?: string;
  characterSpacing?: CharacterSpacing;
};

export const characterSpacingCss: Record<CharacterSpacing, string> = {
  tight: "-0.03em",
  normal: "normal",
  wide: "0.08em",
};

const approvedSpacing = new Map(Object.entries(characterSpacingCss).map(([key, value]) => [value, key as CharacterSpacing]));
const allowedTags = new Set(["b", "strong", "i", "em", "u", "s", "strike", "del", "sup", "sub", "span", "br"]);
const dangerousContainers = /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Strict, environment-independent sanitizer for the app's canonical inline HTML. */
export function sanitizeRichHtml(html: string) {
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(dangerousContainers, "");
  const output: string[] = [];
  const stack: { sourceTag: string; closing: string[] }[] = [];

  for (const token of source.match(/<[^>]*>|[^<]+|</g) ?? []) {
    if (!token.startsWith("<") || token === "<") {
      output.push(escapeHtml(decodeHtml(token)));
      continue;
    }
    const match = token.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);
    if (!match) continue;
    const closing = Boolean(match[1]);
    const sourceTag = match[2].toLowerCase();
    if (!allowedTags.has(sourceTag)) continue;
    if (sourceTag === "br") {
      if (!closing) output.push("<br>");
      continue;
    }
    if (closing) {
      const index = stack.map((entry) => entry.sourceTag).lastIndexOf(sourceTag);
      if (index < 0) continue;
      while (stack.length > index) {
        const entry = stack.pop();
        if (entry) output.push(...entry.closing);
      }
      continue;
    }

    const opening: string[] = [];
    const closingTags: string[] = [];
    const semantic = normalizeSemanticTag(sourceTag);
    if (semantic) { opening.push(`<${semantic}>`); closingTags.unshift(`</${semantic}>`); }
    const style = safeStyle(token);
    if (style.bold) { opening.push("<strong>"); closingTags.unshift("</strong>"); }
    if (style.italic) { opening.push("<em>"); closingTags.unshift("</em>"); }
    if (style.css.length) { opening.push(`<span style="${style.css.join(";")}">`); closingTags.unshift("</span>"); }
    output.push(...opening);
    stack.push({ sourceTag, closing: closingTags });
  }
  while (stack.length) output.push(...stack.pop()!.closing);
  return output.join("");
}

export function visibleRichText(html: string) {
  return parseInlineRuns(sanitizeRichHtml(html), "").map((run) => run.text).join("");
}

export function serializeInlineRuns(runs: InlineTextRun[]) {
  return runs.map((run) => {
    let value = escapeHtml(run.text).replace(/\n/g, "<br>");
    const styles: string[] = [];
    const color = normalizeCssColor(run.color);
    const highlight = normalizeCssColor(run.highlight);
    if (color) styles.push(`color:${color}`);
    if (highlight) styles.push(`background-color:${highlight}`);
    const decorations = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean);
    if (decorations.length) styles.push(`text-decoration:${decorations.join(" ")}`);
    if (run.characterSpacing) styles.push(`letter-spacing:${characterSpacingCss[run.characterSpacing]}`);
    if (styles.length) value = `<span style="${styles.join(";")}">${value}</span>`;
    if (run.superscript) value = `<sup>${value}</sup>`;
    if (run.subscript) value = `<sub>${value}</sub>`;
    if (run.italic) value = `<em>${value}</em>`;
    if (run.bold) value = `<strong>${value}</strong>`;
    return value;
  }).join("");
}

export function parseInlineRuns(html: string | undefined, fallback: string): InlineTextRun[] {
  if (!html) return [{ text: fallback }];
  const runs: InlineTextRun[] = [];
  const stack: { tag: string; state: Omit<InlineTextRun, "text"> }[] = [];
  let state: Omit<InlineTextRun, "text"> = {};
  for (const token of html.split(/(<[^>]+>)/).filter(Boolean)) {
    if (!token.startsWith("<")) {
      const text = decodeHtml(token);
      if (text) pushRun(runs, { text, ...state });
      continue;
    }
    const tag = token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
    if (!tag) continue;
    if (tag === "br") { pushRun(runs, { text: "\n", ...state }); continue; }
    if (/^<\//.test(token)) {
      const index = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (index >= 0) { state = stack[index].state; stack.splice(index); }
      continue;
    }
    stack.push({ tag, state: { ...state } });
    state = applyTag(state, tag, token);
  }
  return runs.length ? runs : [{ text: fallback }];
}

export function cssColorToHex(value: string | undefined): string | undefined {
  return normalizeCssColor(value)?.slice(1);
}

function normalizeSemanticTag(tag: string) {
  if (tag === "b" || tag === "strong") return "strong";
  if (tag === "i" || tag === "em") return "em";
  if (tag === "s" || tag === "strike" || tag === "del") return "s";
  if (["u", "sup", "sub"].includes(tag)) return tag;
  return undefined;
}

function safeStyle(source: string) {
  const result = { bold: false, italic: false, css: [] as string[] };
  const style = source.match(/\sstyle\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim().toLowerCase();
    if (property === "color") {
      const color = normalizeCssColor(value);
      if (color) result.css.push(`color:${color}`);
    } else if (property === "background-color") {
      const color = normalizeCssColor(value);
      if (color) result.css.push(`background-color:${color}`);
    } else if ((property === "text-decoration" || property === "text-decoration-line") && /^(?:underline|line-through|\s)+$/.test(value)) {
      const decorations = [value.includes("underline") ? "underline" : "", value.includes("line-through") ? "line-through" : ""].filter(Boolean);
      if (decorations.length) result.css.push(`text-decoration:${decorations.join(" ")}`);
    } else if (property === "letter-spacing" && approvedSpacing.has(value)) result.css.push(`letter-spacing:${value}`);
    else if (property === "font-weight" && (value === "bold" || Number.parseInt(value, 10) >= 600)) result.bold = true;
    else if (property === "font-style" && (value === "italic" || value === "oblique")) result.italic = true;
  }
  return result;
}

function normalizeCssColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) return `#${hex.toUpperCase()}`;
  const short = value.trim().match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short.slice(1).map((part) => part + part).join("").toUpperCase()}`;
  const rgb = value.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i);
  if (!rgb || rgb.slice(1, 4).some((part) => Number(part) > 255)) return undefined;
  return `#${rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function applyTag(current: Omit<InlineTextRun, "text">, tag: string, source: string) {
  const next = { ...current };
  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "del" || tag === "strike") next.strike = true;
  if (tag === "sup") { next.superscript = true; delete next.subscript; }
  if (tag === "sub") { next.subscript = true; delete next.superscript; }
  const style = source.match(/\sstyle\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property === "color") next.color = value;
    if (property === "background-color") next.highlight = value;
    if (property === "text-decoration" || property === "text-decoration-line") {
      if (value.includes("underline")) next.underline = true;
      if (value.includes("line-through")) next.strike = true;
    }
    if (property === "letter-spacing") next.characterSpacing = approvedSpacing.get(value);
  }
  return next;
}

function pushRun(runs: InlineTextRun[], run: InlineTextRun) {
  const previous = runs.at(-1);
  const sameStyle = previous && JSON.stringify({ ...previous, text: undefined }) === JSON.stringify({ ...run, text: undefined });
  if (sameStyle) previous.text += run.text;
  else runs.push(run);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[code.toLowerCase()]) return named[code.toLowerCase()];
    const number = code.toLowerCase().startsWith("#x") ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}
