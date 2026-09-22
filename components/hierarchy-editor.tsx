"use client";

import { Bold, ChevronDown, GitBranch, Highlighter, Italic, Palette, Strikethrough, Subscript, Superscript, Trash2, Underline } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FieldInputMode, StudyItem } from "@/lib/db/schema";
import { applyLatexShortcuts, type LatexShortcut } from "@/lib/latex-shortcuts";
import { conceptTargetAttributes, type ConceptTarget, useConceptEngine } from "@/components/concept-engine";
import { characterSpacingCss, sanitizeRichHtml, type CharacterSpacing } from "@/lib/rich-text";

export type TaxonomyData = { nodes: { id: string; name: string; kind: string }[]; edges: { parentId: string; childId: string }[] };

export function HierarchyEditor({
  items,
  mode,
  onChange,
  taxonomy,
  shortcuts,
  startIndex = 0,
  renderAnchoredImages,
  onImageDrop,
  concept,
  readOnly = false,
}: {
  items: StudyItem[];
  mode: Exclude<FieldInputMode, "text">;
  onChange: (items: StudyItem[]) => void;
  taxonomy?: TaxonomyData;
  shortcuts: LatexShortcut[];
  startIndex?: number;
  renderAnchoredImages?: (
    itemId: string,
    side: "before" | "after",
  ) => React.ReactNode;
  onImageDrop?: (
    imageId: string,
    anchorItemId: string,
    anchorSide: "before" | "after",
    clientX: number,
  ) => void;
  concept?: { ownerType: "drug" | "collection"; ownerId: string; sectionId?: string; blockId?: string };
  readOnly?: boolean;
}) {
  const focusNext = useRef<string | undefined>(undefined); const emptyId = useId(); const emptyItem = useRef<StudyItem>({ id: `empty-${emptyId}`, text: "" }); const renderedItems = items.length ? items : [emptyItem.current];
  useEffect(() => { if (!focusNext.current) return; const input = document.querySelector<HTMLElement>(`[data-study-item="${focusNext.current}"]`); if (input) { input.focus(); placeCaretAtEnd(input); } focusNext.current = undefined; }, [items]);
  function change(id: string, patch: Partial<StudyItem>) { onChange(updateItem(renderedItems, id, patch)); }
  function keyAction(event: React.KeyboardEvent<HTMLElement>, id: string, content: Pick<StudyItem, "text" | "html">) {
    const source = updateItem(renderedItems, id, content);

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const targetId = event.key === "ArrowUp"
        ? previousItemId(source, id)
        : nextItemId(source, id);

      if (!targetId) return;

      const offset = caretOffset(event.currentTarget);
      const target = document.querySelector<HTMLElement>(`[data-study-item="${targetId}"]`);
      if (!target) return;

      event.preventDefault();
      target.focus({ preventScroll: true });
      placeCaretAtOffset(target, offset);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      onChange(event.shiftKey ? outdentItem(source, id) : indentItem(source, id));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = newItem();
      focusNext.current = item.id;
      onChange(addAfter(source, id, item));
      return;
    }

    if (event.key === "Backspace" && !content.text && items.length) {
      const previous = previousItemId(source, id);
      if (!previous) return;

      event.preventDefault();
      focusNext.current = previous;
      onChange(removeItem(source, id));
    }
  }
  return <div className="hierarchy-editor"><HierarchyRows concept={concept} items={renderedItems} depth={0} mode={mode} onChange={change} onKeyAction={keyAction} onRemove={(itemId) => onChange(removeItem(renderedItems, itemId))} taxonomy={taxonomy} shortcuts={shortcuts} startIndex={startIndex} renderAnchoredImages={renderAnchoredImages} onImageDrop={onImageDrop} readOnly={readOnly}/></div>;
}

function HierarchyRows({
  items,
  depth,
  mode,
  onChange,
  onKeyAction,
  onRemove,
  taxonomy,
  shortcuts,
  startIndex,
  inheritedTaxonId,
  renderAnchoredImages,
  onImageDrop,
  concept,
  readOnly,
}: {
  items: StudyItem[];
  depth: number;
  mode: Exclude<FieldInputMode, "text">;
  onChange: (id: string, patch: Partial<StudyItem>) => void;
  onKeyAction: (
    event: React.KeyboardEvent<HTMLElement>,
    id: string,
    content: Pick<StudyItem, "text" | "html">,
  ) => void;
  onRemove: (id: string) => void;
  taxonomy?: TaxonomyData;
  shortcuts: LatexShortcut[];
  startIndex: number;
  inheritedTaxonId?: string;
  renderAnchoredImages?: (
    itemId: string,
    side: "before" | "after",
  ) => React.ReactNode;
  onImageDrop?: (
    imageId: string,
    anchorItemId: string,
    anchorSide: "before" | "after",
    clientX: number,
  ) => void;
  concept?: { ownerType: "drug" | "collection"; ownerId: string; sectionId?: string; blockId?: string };
  readOnly: boolean;
}) {
  return <>{items.map((item, index) => {
    const activeTaxonId = item.linkedConstituentId ?? inheritedTaxonId;

    function clearActiveImageSlots() {
      document
        .querySelectorAll<HTMLElement>(".hierarchy-image-slot.active")
        .forEach((slot) => slot.classList.remove("active"));
    }

    function imageDragEvents(side: "before" | "after") {
      if (readOnly) return {};
      return {
        onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
          if (
            !event.dataTransfer.types.includes(
              "application/x-herb-image-block",
            )
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          clearActiveImageSlots();
          event.currentTarget.classList.add("active");
        },
        onDragLeave: (event: React.DragEvent<HTMLDivElement>) => {
          const related = event.relatedTarget as Node | null;

          if (
            related
            && event.currentTarget.contains(related)
          ) {
            return;
          }

          event.currentTarget.classList.remove("active");
        },
        onDrop: (event: React.DragEvent<HTMLDivElement>) => {
          const imageId = event.dataTransfer.getData(
            "application/x-herb-image-block",
          );

          if (!imageId) return;

          event.preventDefault();
          event.stopPropagation();

          clearActiveImageSlots();

          onImageDrop?.(
            imageId,
            item.id,
            side,
            event.clientX,
          );
        },
      };
    }

    return (
      <div className="hierarchy-node" key={item.id}>
        <div
          className="hierarchy-image-slot"
          style={{
            marginLeft: depth ? `${-depth * 35}px` : undefined,
          }}
          {...imageDragEvents("before")}
        >
          {renderAnchoredImages?.(item.id, "before")}
        </div>

        <div className={`hierarchy-row depth-${Math.min(depth, 3)}`}>
          <span className="hierarchy-marker">
            {marker(
              depth,
              index + (depth === 0 ? startIndex : 0),
              mode,
            )}
          </span>

          <RichStudyInput
            conceptTarget={concept ? { ownerType: concept.ownerType, ownerId: concept.ownerId, targetType: concept.ownerType === "drug" ? "study_item" : "collection_hierarchy_item", targetRef: { sectionId: concept.sectionId, blockId: concept.blockId, itemId: item.id } } : undefined}
            item={item}
            shortcuts={shortcuts}
            taxonomy={taxonomy}
            contextTaxonId={inheritedTaxonId ?? item.linkedConstituentId}
            onChange={(patch) => onChange(item.id, patch)}
            onKeyAction={(event, content) =>
              onKeyAction(event, item.id, content)
            }
            onRemove={() => onRemove(item.id)}
            readOnly={readOnly}
          />

          {item.linkedConstituentId && taxonomy
            ? <TaxonomyIndicator
                taxonId={item.linkedConstituentId}
                taxonomy={taxonomy}
              />
            : null}
        </div>

        <div
          className="hierarchy-image-slot"
          style={{
            marginLeft: depth ? `${-depth * 35}px` : undefined,
          }}
          {...imageDragEvents("after")}
        >
          {renderAnchoredImages?.(item.id, "after")}
        </div>

        {item.children?.length
          ? <div className="hierarchy-children">
              <HierarchyRows
                items={item.children}
                depth={depth + 1}
                mode={mode}
                onChange={onChange}
                onKeyAction={onKeyAction}
                onRemove={onRemove}
                taxonomy={taxonomy}
                shortcuts={shortcuts}
                startIndex={0}
                inheritedTaxonId={activeTaxonId}
                renderAnchoredImages={renderAnchoredImages}
                onImageDrop={onImageDrop}
                concept={concept}
                readOnly={readOnly}
              />
            </div>
          : null}
      </div>
    );
  })}</>;
}

function RichStudyInput({ item, shortcuts, taxonomy, contextTaxonId, onChange, onKeyAction, onRemove, conceptTarget, readOnly }: { item: StudyItem; shortcuts: LatexShortcut[]; taxonomy?: TaxonomyData; contextTaxonId?: string; onChange: (patch: Partial<StudyItem>) => void; onKeyAction: (event: React.KeyboardEvent<HTMLElement>, content: Pick<StudyItem, "text" | "html">) => void; onRemove: () => void; conceptTarget?: ConceptTarget; readOnly: boolean }) {
  const editor = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | undefined>(undefined);
  const composing = useRef(false);
  const concepts = useConceptEngine();
  const [highlightColor, setHighlightColor] = useState("#f3df73"); const [highlightArmed, setHighlightArmed] = useState(false); const [paletteOpen, setPaletteOpen] = useState(false); const [context, setContext] = useState<{ x: number; y: number; text: string }>();
  const [presets, setPresets] = useState(["#f3df73", "#9ed9a5", "#91c7f3", "#e9a6c5"]);
  useEffect(() => { const stored = localStorage.getItem("highlight-presets"); if (stored) try { setPresets(JSON.parse(stored)); } catch { /* ignore invalid local preference */ } }, []);
  useEffect(() => {
    if (!context) return;

    function dismissContextMenu(event: MouseEvent) {
      const target = event.target as Node | null;

      if (
        target
        && document
          .querySelector(".constituent-context-menu")
          ?.contains(target)
      ) {
        return;
      }

      setContext(undefined);
    }

    document.addEventListener("mousedown", dismissContextMenu);

    return () => {
      document.removeEventListener("mousedown", dismissContextMenu);
    };
  }, [context]);  
  useEffect(() => { const node = editor.current; if (!node || document.activeElement === node) return; const desired = item.html ? sanitizeRichHtml(item.html) : escapeHtml(item.text); if (node.innerHTML !== desired) node.innerHTML = desired; }, [item.html, item.text]);
  function content() { const node = editor.current!; return { text: node.innerText.replace(/\n/g, ""), html: sanitizeRichHtml(node.innerHTML) }; }
  function emit() { const next = content(); if (conceptTarget && concepts?.reconcileText(conceptTarget, item.text, next.text) === false) { const node = editor.current; if (node) node.innerHTML = item.html ? sanitizeRichHtml(item.html) : escapeHtml(item.text); return; } onChange(next); }
  function normalize(includeEnd: boolean) {
    const node = editor.current;
    if (!node) return;

    const selection = window.getSelection();
    const hasCaret = Boolean(
      selection?.rangeCount
      && selection.isCollapsed
      && node.contains(selection.anchorNode),
    );

    const offset = hasCaret
      ? caretOffset(node)
      : 0;

    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT,
    );

    const textNodes: Text[] = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    let totalDelta = 0;
    let changed = false;

    for (const textNode of textNodes) {
      const before = textNode.data;
      const after = applyLatexShortcuts(
        before,
        includeEnd,
        shortcuts,
      );

      if (after === before) continue;

      textNode.data = after;
      totalDelta += after.length - before.length;
      changed = true;
    }

    if (changed && hasCaret) {
      placeCaretAtOffset(
        node,
        Math.max(0, offset + totalDelta),
      );
    }
  }
  function rememberSelection() { const selection = window.getSelection(); const node = editor.current; if (selection?.rangeCount && node?.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange(); }
  function restoreSelection() { const range = savedRange.current; if (!range) return false; const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return !range.collapsed; }
  function command(name: string, value?: string) {
    const node = editor.current;
    if (!node) return;

    const selection = window.getSelection();
    const liveRange = selection?.rangeCount && node.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : savedRange.current?.cloneRange();

    node.focus({ preventScroll: true });

    if (liveRange) {
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(liveRange);
      savedRange.current = liveRange.cloneRange();
    }

    document.execCommand("styleWithCSS", false, "true");
    if (name === "superscript" && document.queryCommandState("subscript")) document.execCommand("subscript");
    if (name === "subscript" && document.queryCommandState("superscript")) document.execCommand("superscript");
    document.execCommand(name, false, value);
    rememberSelection();
    emit();
  }
  function applyCharacterSpacing(spacing: CharacterSpacing) {
    const node = editor.current;
    if (!node || !restoreSelection()) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (!range || range.collapsed || !node.contains(range.commonAncestorContainer)) return;
    const span = document.createElement("span");
    span.style.letterSpacing = characterSpacingCss[spacing];
    span.append(range.extractContents());
    range.insertNode(span);
    range.selectNodeContents(span);
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange.current = range.cloneRange();
    emit();
  }
  function chooseHighlight(color: string) { setHighlightColor(color); setPaletteOpen(false); if (!presets.includes(color)) { const next = [...presets, color].slice(-8); setPresets(next); localStorage.setItem("highlight-presets", JSON.stringify(next)); } }
  const taxon = taxonomy?.nodes.find((node) => node.id === contextTaxonId);
  async function createConstituent() {
    if (!context || !contextTaxonId) return;
    const response = await fetch("/api/constituents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: context.text, taxonId: contextTaxonId }) }); const body = await response.json();
    setContext(undefined); if (!response.ok) window.alert(body.error ?? "Constituent를 추가하지 못했습니다."); else window.alert(`“${context.text}”을(를) ${taxon?.name ?? "상위 분류"}에 연결했습니다.`);
  }
  return <div className="rich-input-wrap">
    <div
      ref={editor}
      className="rich-study-input"
      data-study-item={item.id}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-placeholder="내용을 입력하세요"
      {...(conceptTarget ? conceptTargetAttributes(conceptTarget) : {})}
      style={{
        fontWeight: item.bold ? 750 : undefined,
        fontStyle: item.italic ? "italic" : undefined,
        background: item.highlight ? "#594f24" : undefined,
      }}
      onCompositionStart={readOnly ? undefined : () => {
        composing.current = true;
      }}
      onCompositionEnd={readOnly ? undefined : () => {
        composing.current = false;
        normalize(false);
        emit();
      }}
      onInput={readOnly ? undefined : () => {
        if (composing.current) return;

        normalize(false);
        emit();
      }}
      onBlur={readOnly ? undefined : () => {
        composing.current = false;
        normalize(true);
        emit();
      }}
      onKeyDown={readOnly ? undefined : (event) => {
        if (event.nativeEvent.isComposing || composing.current) {
          return;
        }

        if ((event.metaKey || event.ctrlKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        command({ b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()]!);
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") normalize(true);
      onKeyAction(event, content());
    }} onMouseUp={() => { rememberSelection(); if (highlightArmed && savedRange.current && !savedRange.current.collapsed) { command("hiliteColor", highlightColor); setHighlightArmed(false); } }} onKeyUp={rememberSelection} onContextMenu={(event) => {
  rememberSelection();

  const selection = window.getSelection()?.toString().trim();
  if (!selection) return;

  if (!contextTaxonId) { if (conceptTarget) concepts?.openMenu(event, conceptTarget); return; }

  event.preventDefault();

  const wrapper = event.currentTarget.closest(
    ".rich-input-wrap",
  ) as HTMLElement | null;

  if (!wrapper) return;

  const bounds = wrapper.getBoundingClientRect();

  const menuWidth = 310;
  const localX = event.clientX - bounds.left + 8;
  const localY = event.clientY - bounds.top + 8;

  setContext({
    x: Math.max(
      0,
      Math.min(localX, bounds.width - menuWidth),
    ),
    y: localY,
    text: selection,
  });
}}/>
    {!readOnly ? <div className="hierarchy-actions">
      <button onMouseDown={(event) => event.preventDefault()} onClick={() => command("bold")} title="선택 영역 굵게 · ⌘B"><Bold size={13}/></button>
      <button onMouseDown={(event) => event.preventDefault()} onClick={() => command("italic")} title="선택 영역 기울임 · ⌘I"><Italic size={13}/></button>
      <button onMouseDown={(event) => event.preventDefault()} onClick={() => command("underline")} title="선택 영역 밑줄 · ⌘U"><Underline size={13}/></button>
      <button onMouseDown={(event) => event.preventDefault()} onClick={() => command("strikeThrough")} title="선택 영역 취소선"><Strikethrough size={13}/></button>
      <button onMouseDown={(event) => event.preventDefault()} onClick={() => command("superscript")} title="위 첨자"><Superscript size={13}/></button>
      <button onMouseDown={(event) => event.preventDefault()} onClick={() => command("subscript")} title="아래 첨자"><Subscript size={13}/></button>
      <select className="character-spacing-select" defaultValue="normal" onMouseDown={rememberSelection} onChange={(event) => applyCharacterSpacing(event.target.value as CharacterSpacing)} title="자간"><option value="tight">좁게</option><option value="normal">보통</option><option value="wide">넓게</option></select>
      <span className="format-split"><button className={highlightArmed ? "active" : ""} style={{ color: highlightColor }} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (restoreSelection() && savedRange.current && !savedRange.current.collapsed) command("hiliteColor", highlightColor); else setHighlightArmed((value) => !value); }} title="하이라이트"><Highlighter size={13}/></button><button onMouseDown={(event) => event.preventDefault()} onClick={() => setPaletteOpen((value) => !value)} title="하이라이트 색"><ChevronDown size={10}/></button>{paletteOpen ? <span className="highlight-palette">{presets.map((color) => <button key={color} style={{ background: color }} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseHighlight(color)} aria-label={`${color} 선택`}/>)}<input type="color" value={highlightColor} onChange={(event) => chooseHighlight(event.target.value)} title="새 색상 저장"/></span> : null}</span>
      <label className="text-color-button" title="글자색"><Palette size={13}/><input type="color" defaultValue="#e7eaee" onChange={(event) => command("foreColor", event.target.value)}/></label>
      <button onClick={() => { if (!conceptTarget) onRemove(); else void concepts?.breakTarget(conceptTarget).then((allowed) => { if (allowed) onRemove(); }); }} title="삭제"><Trash2 size={13}/></button>
    </div> : null}
    {!readOnly && context ? <div className="constituent-context-menu" style={{ left: context.x, top: context.y }}><button onMouseDown={(event) => { event.preventDefault(); restoreSelection(); }} onClick={() => { if (conceptTarget && editor.current) void concepts?.createSelectionAnchor(conceptTarget, editor.current); setContext(undefined); }}><strong>개념연결</strong><span>선택한 텍스트를 개념 앵커로 만들기</span></button><button onClick={() => void createConstituent()}><strong>“{context.text}”</strong><span>{taxon?.name ?? "상위 분류"}의 constituent로 추가</span></button></div> : null}
  </div>;
}

function TaxonomyIndicator({ taxonId, taxonomy }: { taxonId: string; taxonomy: TaxonomyData }) {
  const [open, setOpen] = useState(false); const paths = resolveLineages(taxonId, taxonomy).slice(0, 12); if (!paths.length) return null;
  return <span className="taxonomy-indicator" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}><button type="button" onClick={() => setOpen((value) => !value)} aria-label="분류 경로 보기" aria-expanded={open}><GitBranch size={12}/></button>{open ? <span className="taxonomy-lineage-popover" role="tooltip">{paths.map((path, index) => <span className="taxonomy-lineage-path" key={path.map((node) => node.id).join("-")}><small>{paths.length > 1 ? `Path ${index + 1}` : "Taxonomy"}</small><strong>{path.map((node) => node.name).join(" › ")}</strong></span>)}<Link href={`/constituents?selected=${taxonId}`}>Compound Tree에서 보기</Link></span> : null}</span>;
}

function resolveLineages(taxonId: string, taxonomy: TaxonomyData) { const byId = new Map(taxonomy.nodes.map((node) => [node.id, node])); const parents = new Map<string, string[]>(); for (const edge of taxonomy.edges) parents.set(edge.childId, [...(parents.get(edge.childId) ?? []), edge.parentId]); function walk(id: string, visited: Set<string>): { id: string; name: string }[][] { const node = byId.get(id); if (!node || visited.has(id)) return []; const nextVisited = new Set(visited).add(id); const parentIds = parents.get(id) ?? []; if (!parentIds.length) return [[{ id: node.id, name: node.name }]]; return parentIds.flatMap((parentId) => walk(parentId, nextVisited).map((path) => [...path, { id: node.id, name: node.name }])); } return walk(taxonId, new Set()); }
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function placeCaretAtEnd(element: HTMLElement) { const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
function caretOffset(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return 0;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.anchorNode!, selection.anchorOffset);
  return range.toString().length;
}

function placeCaretAtOffset(element: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastTextNode: Text | undefined;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    lastTextNode = textNode;

    if (remaining <= textNode.data.length) {
      const range = document.createRange();
      range.setStart(textNode, remaining);
      range.collapse(true);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }

    remaining -= textNode.data.length;
  }

  if (lastTextNode) {
    const range = document.createRange();
    range.setStart(lastTextNode, lastTextNode.data.length);
    range.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return;
  }

  placeCaretAtEnd(element);
}
function newItem(): StudyItem { return { id: crypto.randomUUID(), text: "" }; }
function marker(depth: number, index: number, mode: Exclude<FieldInputMode, "text">) { const adjusted = mode === "hierarchy3" ? depth + 1 : depth; if (adjusted === 0) return `${toRoman(index + 1).toLowerCase()})`; if (adjusted === 1) return index < 20 ? String.fromCodePoint(0x2460 + index) : `(${index + 1})`; if (adjusted === 2) return `${String.fromCharCode(97 + (index % 26))})`; return "•"; }
function toRoman(value: number) { const pairs: [number, string][] = [[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]]; let number = value, result = ""; for (const [amount, symbol] of pairs) while (number >= amount) { result += symbol; number -= amount; } return result; }
function updateItem(items: StudyItem[], id: string, patch: Partial<StudyItem>): StudyItem[] { return items.map((item) => item.id === id ? { ...item, ...patch } : { ...item, ...(item.children ? { children: updateItem(item.children, id, patch) } : {}) }); }
function removeItem(items: StudyItem[], id: string): StudyItem[] { return items.filter((item) => item.id !== id).map((item) => ({ ...item, ...(item.children ? { children: removeItem(item.children, id) } : {}) })); }
function flatten(items: StudyItem[]): StudyItem[] { return items.flatMap((item) => [item, ...flatten(item.children ?? [])]); }
function previousItemId(items: StudyItem[], id: string) { const rows = flatten(items); const index = rows.findIndex((item) => item.id === id); return index > 0 ? rows[index - 1].id : undefined; }
function nextItemId(items: StudyItem[], id: string) { const rows = flatten(items); const index = rows.findIndex((item) => item.id === id); return index >= 0 && index < rows.length - 1 ? rows[index + 1].id : undefined; }
function findPath(items: StudyItem[], id: string, prefix: number[] = []): number[] | null { for (let index = 0; index < items.length; index++) { if (items[index].id === id) return [...prefix, index]; const nested = items[index].children ? findPath(items[index].children!, id, [...prefix, index]) : null; if (nested) return nested; } return null; }
function listAt(root: StudyItem[], parentPath: number[]): StudyItem[] { let list = root; for (const index of parentPath) { list[index].children ??= []; list = list[index].children!; } return list; }
function mutateTree(items: StudyItem[], mutate: (root: StudyItem[]) => void) { const next = structuredClone(items); mutate(next); return next; }
function indentItem(items: StudyItem[], id: string) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path) return; const index = path.at(-1)!; if (index === 0) return; const list = listAt(root, path.slice(0, -1)); const [item] = list.splice(index, 1); const previous = list[index - 1]; previous.children ??= []; previous.children.push(item); }); }
function outdentItem(items: StudyItem[], id: string) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path || path.length < 2) return; const index = path.at(-1)!; const parentPath = path.slice(0, -1); const parentIndex = parentPath.at(-1)!; const list = listAt(root, parentPath); const [item] = list.splice(index, 1); const parentList = listAt(root, parentPath.slice(0, -1)); parentList.splice(parentIndex + 1, 0, item); }); }
function addAfter(items: StudyItem[], id: string, newValue: StudyItem) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path) return; const list = listAt(root, path.slice(0, -1)); list.splice(path.at(-1)! + 1, 0, newValue); }); }
