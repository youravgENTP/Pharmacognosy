"use client";
/* eslint-disable @next/next/no-img-element -- study images must preserve source fidelity and use a private media route */

import { ImagePlus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { HierarchyEditor, type TaxonomyData } from "@/components/hierarchy-editor";
import { useLatexShortcuts } from "@/components/use-latex-shortcuts";
import type { FieldInputMode, StudyBlock, StudyItem } from "@/lib/db/schema";
import { applyLatexShortcuts } from "@/lib/latex-shortcuts";

type ChangeValue = { items: StudyItem[]; blocks: StudyBlock[] };

export function StudyContentEditor({ items, blocks, mode, onChange, taxonomy }: { items: StudyItem[]; blocks?: StudyBlock[]; mode: FieldInputMode; onChange: (value: ChangeValue) => void; taxonomy?: TaxonomyData }) {
  const latexShortcuts = useLatexShortcuts();
  const legacyId = useId(); const fileInput = useRef<HTMLInputElement>(null); const editorRoot = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false); const [dragging, setDragging] = useState(false); const [draggedBlockId, setDraggedBlockId] = useState<string>(); const [dropTarget, setDropTarget] = useState<{ index: number; before: boolean }>(); const [error, setError] = useState<string>();
  const rendered: StudyBlock[] = blocks?.length ? blocks : [{ id: `legacy-${legacyId}`, type: "items", items }];
  function commit(next: StudyBlock[]) { onChange({ blocks: next, items: next.flatMap((block) => block.type === "items" ? block.items : []) }); }
  function updateText(id: string, nextItems: StudyItem[]) { commit(rendered.map((block) => block.id === id && block.type === "items" ? { ...block, items: nextItems } : block)); }
  function updateImage(id: string, patch: Partial<Extract<StudyBlock, { type: "image" }>>) { commit(rendered.map((block) => block.id === id && block.type === "image" ? { ...block, ...patch } : block)); }
  function dropBlock(targetIndex: number, before: boolean, clientX: number) {
    if (!draggedBlockId) return;
    const sourceIndex = rendered.findIndex((block) => block.id === draggedBlockId); if (sourceIndex < 0) return;
    const next = [...rendered]; const [moved] = next.splice(sourceIndex, 1); let insertion = targetIndex + (before ? 0 : 1); if (sourceIndex < insertion) insertion -= 1; insertion = Math.max(0, Math.min(next.length, insertion));
    const bounds = editorRoot.current?.getBoundingClientRect(); if (moved.type === "image" && bounds) { const width = moved.widthPercent ?? ({ small: 25, medium: 50, large: 75, full: 100 }[moved.size]); moved.xPercent = Math.round(Math.max(0, Math.min(100 - width, (clientX - bounds.left) / bounds.width * 100 - width / 2)) * 10) / 10; moved.align = "left"; }
    next.splice(insertion, 0, moved); commit(next); setDraggedBlockId(undefined); setDropTarget(undefined);
  }
  async function upload(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true); setError(undefined);
    try {
      const prepared = await prepareImage(file); const form = new FormData(); form.append("file", prepared.file); form.append("width", String(prepared.width)); form.append("height", String(prepared.height));
      const response = await fetch("/api/media", { method: "POST", body: form });
      const asset = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      if (!response.ok) throw new Error(asset?.error ?? "이미지를 업로드하지 못했습니다.");
      if (!asset?.id) throw new Error("이미지 업로드 응답을 확인하지 못했습니다.");
      commit([...rendered, { id: crypto.randomUUID(), type: "image", mediaAssetId: asset.id, size: "medium", widthPercent: 50, xPercent: 0, align: "left" }, { id: crypto.randomUUID(), type: "items", items: [] }]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "이미지를 업로드하지 못했습니다."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  let topLevelOffset = 0;
  return <div ref={editorRoot} className={`study-content-editor ${dragging ? "dragging" : ""}`} tabIndex={0} onPaste={(event) => { const file = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile(); if (file) { event.preventDefault(); void upload(file); } }} onDragOver={(event) => { event.preventDefault(); if (!draggedBlockId) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); if (draggedBlockId) { dropBlock(rendered.length - 1, false, event.clientX); return; } void upload([...event.dataTransfer.files].find((file) => file.type.startsWith("image/"))); }}>
    {rendered.map((block, index) => {
      const dropClass = dropTarget?.index === index ? (dropTarget.before ? "drop-before" : "drop-after") : "";
      const dragEvents = { onDragOver: (event: React.DragEvent<HTMLDivElement>) => { if (!draggedBlockId) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ index, before: event.clientY < bounds.top + bounds.height / 2 }); }, onDrop: (event: React.DragEvent<HTMLDivElement>) => { if (!draggedBlockId) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); dropBlock(index, event.clientY < bounds.top + bounds.height / 2, event.clientX); } };
      if (block.type === "image") return <div className={`study-flow-block ${dropClass}`} key={block.id} {...dragEvents}><ImageBlock block={block} onResize={(widthPercent, xPercent) => updateImage(block.id, { widthPercent, xPercent })} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-herb-image-block", block.id); setDraggedBlockId(block.id); }} onDragEnd={() => { setDraggedBlockId(undefined); setDropTarget(undefined); }} onDelete={() => commit(rendered.filter((item) => item.id !== block.id))}/></div>;
      const offset = topLevelOffset; topLevelOffset += block.items.length;
      return <div className={`study-flow-block study-items-block ${dropClass}`} key={block.id} {...dragEvents}>{mode === "text" ? <TextEditor items={block.items} shortcuts={latexShortcuts} onChange={(next) => updateText(block.id, next)}/> : <HierarchyEditor items={block.items} mode={mode} shortcuts={latexShortcuts} onChange={(next) => updateText(block.id, next)} taxonomy={taxonomy} startIndex={offset}/>}</div>;
    })}
    <div className="image-insert-row"><button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}><ImagePlus size={14}/>{uploading ? "업로드 중…" : "이미지"}</button><span>파일을 드래그하거나 붙여넣기 ⌘V</span><input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => void upload(event.target.files?.[0])}/></div>
    {dragging ? <div className="image-drop-overlay"><ImagePlus size={22}/> 이미지를 놓아 삽입</div> : null}{error ? <p className="image-upload-error">{error}</p> : null}
  </div>;
}

function TextEditor({ items, shortcuts, onChange }: { items: StudyItem[]; shortcuts: import("@/lib/latex-shortcuts").LatexShortcut[]; onChange: (items: StudyItem[]) => void }) {
  const emptyId = useId(); const item = items[0] ?? { id: `empty-${emptyId}`, text: "" };
  return <textarea className="plain-field-editor" value={item.text} onChange={(event) => onChange([{ ...item, text: applyLatexShortcuts(event.target.value, false, shortcuts) }])} onBlur={(event) => onChange([{ ...item, text: applyLatexShortcuts(event.currentTarget.value, true, shortcuts) }])} placeholder="내용을 입력하세요"/>;
}

function ImageBlock({ block, onResize, onDragStart, onDragEnd, onDelete }: { block: Extract<StudyBlock, { type: "image" }>; onResize: (widthPercent: number, xPercent: number) => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void; onDelete: () => void }) {
  const initialWidth = block.widthPercent ?? ({ small: 25, medium: 50, large: 75, full: 100 }[block.size]); const initialX = block.xPercent ?? (block.align === "center" ? (100 - initialWidth) / 2 : block.align === "right" ? 100 - initialWidth : 0); const [preview, setPreview] = useState({ width: initialWidth, x: initialX });
  function beginResize(event: React.PointerEvent<HTMLButtonElement>, side: "left" | "right") {
    event.preventDefault(); event.stopPropagation(); const figure = event.currentTarget.closest("figure"); const containerWidth = figure?.parentElement?.clientWidth || 1; const startPointerX = event.clientX; const start = preview;
    const calculate = (clientX: number) => {
      const pointerDelta = (clientX - startPointerX) / containerWidth * 100;

      if (side === "left") {
        const rightEdge = start.x + start.width;
        const nextX = Math.max(0, Math.min(rightEdge - 15, start.x + pointerDelta));

        return {
          width: rightEdge - nextX,
          x: nextX,
        };
      }

      const nextWidth = Math.max(
        15,
        Math.min(100 - start.x, start.width + pointerDelta),
      );

      return {
        width: nextWidth,
        x: start.x,
      };
    };
    const move = (pointer: PointerEvent) => setPreview(calculate(pointer.clientX));
    const end = (pointer: PointerEvent) => { const value = calculate(pointer.clientX); const width = Math.round(value.width * 10) / 10; const x = Math.round(value.x * 10) / 10; setPreview({ width, x }); onResize(width, x); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
  }
  return <figure draggable className="study-image-block" style={{ width: `${preview.width}%`, marginLeft: `${preview.x}%` }} onDragStart={onDragStart} onDragEnd={onDragEnd}><img src={`/api/media/${block.mediaAssetId}/content`} alt="학습 자료 이미지" draggable={false}/>{(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => <button type="button" className={`image-resize-handle ${corner}`} key={corner} onPointerDown={(event) => beginResize(event, corner.endsWith("left") ? "left" : "right")} aria-label="이미지 크기 조절"/>)}<div className="study-image-toolbar"><button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={onDelete} title="삭제"><Trash2 size={14}/></button></div></figure>;
}

async function prepareImage(file: File) {
  const dimensions = await imageDimensions(file);
  if (file.size <= 8 * 1024 * 1024 && Math.max(dimensions.width, dimensions.height) <= 4096) return { file, ...dimensions };
  const scale = Math.min(1, 3000 / Math.max(dimensions.width, dimensions.height)); const width = Math.round(dimensions.width * scale); const height = Math.round(dimensions.height * scale);
  const bitmap = await createImageBitmap(file); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height); bitmap.close();
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg"; const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("이미지를 처리하지 못했습니다.")), mime, .92));
  return { file: new File([blob], file.name, { type: mime }), width, height };
}

function imageDimensions(file: File) { return new Promise<{ width: number; height: number }>((resolve, reject) => { const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없습니다.")); }; image.src = url; }); }
