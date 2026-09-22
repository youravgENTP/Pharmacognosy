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

export function sanitizeRichHtml(html: string) {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const strike of [...template.content.querySelectorAll("strike")]) {
    const replacement = document.createElement("s");
    replacement.append(...strike.childNodes);
    strike.replaceWith(replacement);
  }
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "DEL", "SUP", "SUB", "SPAN", "BR"]);

  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const style = (element as HTMLElement).style;
    const bold = style.fontWeight === "bold" || Number.parseInt(style.fontWeight, 10) >= 600;
    const italic = style.fontStyle === "italic" || style.fontStyle === "oblique";
    const color = style.color;
    const backgroundColor = style.backgroundColor;
    const decoration = [style.textDecorationLine, style.textDecoration]
      .join(" ")
      .toLowerCase();
    const letterSpacing = approvedSpacing.has(style.letterSpacing)
      ? style.letterSpacing
      : "";

    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (color) style.color = color;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    const decorations = [
      decoration.includes("underline") ? "underline" : "",
      decoration.includes("line-through") ? "line-through" : "",
    ].filter(Boolean);
    if (decorations.length) style.textDecoration = decorations.join(" ");
    if (letterSpacing) style.letterSpacing = letterSpacing;
    if (bold) wrapContents(element, "b");
    if (italic) wrapContents(element, "i");
  }

  return template.innerHTML;
}

function wrapContents(element: Element, tag: "b" | "i") {
  const wrapper = document.createElement(tag);
  wrapper.append(...element.childNodes);
  element.append(wrapper);
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
    if (tag === "br") {
      pushRun(runs, { text: "\n", ...state });
      continue;
    }

    if (/^<\//.test(token)) {
      const index = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (index >= 0) {
        state = stack[index].state;
        stack.splice(index);
      }
      continue;
    }

    stack.push({ tag, state: { ...state } });
    state = applyTag(state, tag, token);
  }

  return runs.length ? runs : [{ text: fallback }];
}

export function cssColorToHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) return hex.toUpperCase();
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return short.slice(1).map((part) => part + part).join("").toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return undefined;
  return rgb.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function applyTag(current: Omit<InlineTextRun, "text">, tag: string, source: string) {
  const next = { ...current };
  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "del") next.strike = true;
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

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot);/gi, (entity, code: string) => {
    if (code.toLowerCase() === "nbsp") return " ";
    if (code.toLowerCase() === "amp") return "&";
    if (code.toLowerCase() === "lt") return "<";
    if (code.toLowerCase() === "gt") return ">";
    if (code.toLowerCase() === "quot") return '"';
    const number = code.toLowerCase().startsWith("#x") ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}
