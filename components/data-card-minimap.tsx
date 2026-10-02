"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent } from "react";
import type { StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";

type IdentificationSummary = {
  hasLatinName: boolean;
  originCount: number;
  hasFamily: boolean;
  relatedCount: number;
  similarCount: number;
  identityTermCount: number;
};

type MinimapPosition = { visible: boolean; left: number; top: number; width: number; height: number };
type DragState = { pointerId: number; grabOffset: number } | null;
type RuntimeTableBlock = { id: string; type: "table"; rows?: number; columns?: number };

const MIN_WIDTH = 100;
const TARGET_WIDTH = 124;
const CARD_GAP = 16;
const VIEWPORT_EDGE = 12;

export function DataCardMinimap({
  rootRef,
  identification,
  sections,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  identification: IdentificationSummary;
  sections: StudySection[];
}) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<MinimapPosition>({ visible: false, left: 0, top: 0, width: TARGET_WIDTH, height: 0 });
  const scrollElementRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const frameRef = useRef<number | null>(null);
  const sectionModels = useMemo(() => sections.map(sectionModel), [sections]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const root = rootRef.current;
    const scrollElement = root?.closest<HTMLElement>(".profile-modal-body") ?? null;
    const card = root?.closest<HTMLElement>(".profile-modal-card") ?? null;
    scrollElementRef.current = scrollElement;
    if (!root || !scrollElement || !card) {
      setPosition((current) => ({ ...current, visible: false }));
      return;
    }

    let layoutFrame: number | null = null;
    const updatePosition = () => {
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const rightSpace = window.innerWidth - rect.right - CARD_GAP - VIEWPORT_EDGE;
        const leftSpace = rect.left - CARD_GAP - VIEWPORT_EDGE;
        const side = rightSpace >= MIN_WIDTH ? "right" : leftSpace >= MIN_WIDTH ? "left" : null;
        if (!side) {
          setPosition((current) => ({ ...current, visible: false }));
          return;
        }
        const width = Math.min(TARGET_WIDTH, side === "right" ? rightSpace : leftSpace);
        setPosition({
          visible: true,
          left: side === "right" ? rect.right + CARD_GAP : rect.left - CARD_GAP - width,
          top: rect.top + 6,
          width,
          height: Math.max(0, rect.height - 12),
        });
      });
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(card);
    observer.observe(root);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      scrollElementRef.current = null;
    };
  }, [mounted, rootRef]);

  useEffect(() => {
    if (!mounted || !position.visible) return;
    const scrollElement = scrollElementRef.current;
    if (!scrollElement) return;

    const updateViewport = () => {
      frameRef.current = null;
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (!track || !viewport) return;
      const trackHeight = track.clientHeight;
      const scrollHeight = scrollElement.scrollHeight;
      const visibleHeight = scrollElement.clientHeight;
      const scrollRange = Math.max(0, scrollHeight - visibleHeight);
      const viewportHeight = scrollHeight > 0 ? Math.max(18, Math.min(trackHeight, trackHeight * visibleHeight / scrollHeight)) : trackHeight;
      const travel = Math.max(0, trackHeight - viewportHeight);
      const top = scrollRange > 0 ? scrollElement.scrollTop / scrollRange * travel : 0;
      viewport.style.height = `${viewportHeight}px`;
      viewport.style.transform = `translate3d(0, ${top}px, 0)`;
    };
    const scheduleViewportUpdate = () => {
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(updateViewport);
    };

    scheduleViewportUpdate();
    scrollElement.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    const observer = new ResizeObserver(scheduleViewportUpdate);
    observer.observe(scrollElement);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      scrollElement.removeEventListener("scroll", scheduleViewportUpdate);
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [mounted, position.visible, position.height, rootRef, sectionModels, identification]);

  function scrollFromPointer(clientY: number, grabOffset?: number) {
    const scrollElement = scrollElementRef.current;
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!scrollElement || !track || !viewport) return;
    const rect = track.getBoundingClientRect();
    const viewportHeight = viewport.offsetHeight;
    const travel = Math.max(0, rect.height - viewportHeight);
    const offset = grabOffset ?? viewportHeight / 2;
    const viewportTop = clamp(clientY - rect.top - offset, 0, travel);
    const scrollRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    scrollElement.scrollTop = travel > 0 ? viewportTop / travel * scrollRange : 0;
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, grabOffset: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    scrollFromPointer(event.clientY, state.grabOffset);
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function forwardWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    scrollElementRef.current?.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
  }

  if (!mounted || !position.visible) return null;

  return createPortal(
    <aside
      className="data-card-minimap"
      aria-label="Mini Data Card Navigator"
      style={{ left: position.left, top: position.top, width: position.width, height: position.height }}
      onWheel={forwardWheel}
    >
      <div className="data-card-minimap-track" ref={trackRef} onPointerDown={(event) => scrollFromPointer(event.clientY)}>
        <div className="data-card-minimap-document" aria-hidden="true">
          <MiniIdentification summary={identification}/>
          {sectionModels.map((section) => <MiniSection key={section.id} section={section}/>) }
        </div>
        <div
          className="data-card-minimap-viewport"
          ref={viewportRef}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={() => { dragRef.current = null; }}
        />
      </div>
    </aside>,
    document.body,
  );
}

type SectionModel = { id: string; titleWidth: number; weight: number; blocks: MiniBlock[] };
type MiniBlock =
  | { type: "text"; lines: number }
  | { type: "items"; lines: { depth: number; width: number }[] }
  | { type: "image"; width: number; left: number }
  | { type: "table"; rows: number; columns: number };

function sectionModel(section: StudySection): SectionModel {
  const source = section.blocks?.length ? section.blocks : [{ id: `items-${section.id}`, type: "items" as const, items: section.items }];
  const blocks = source.map(miniBlock).filter((block): block is MiniBlock => block !== null);
  const weight = 2 + blocks.reduce((sum, block) => sum + blockWeight(block), 0);
  return { id: section.id, titleWidth: clamp(34 + section.title.length * 3, 42, 88), weight, blocks };
}

function miniBlock(block: StudyBlock | RuntimeTableBlock): MiniBlock | null {
  if (block.type === "text") return { type: "text", lines: clamp(Math.ceil(block.content.text.length / 38), 1, 8) };
  if (block.type === "items") return { type: "items", lines: flattenItems(block.items).slice(0, 14) };
  if (block.type === "image") return { type: "image", width: clamp(block.widthPercent ?? imageWidth(block.size), 24, 100), left: clamp(block.xPercent ?? alignedLeft(block.align, block.widthPercent ?? imageWidth(block.size)), 0, 76) };
  if (block.type === "table") return { type: "table", rows: clamp(block.rows ?? 3, 2, 6), columns: clamp(block.columns ?? 3, 2, 5) };
  return null;
}

function MiniIdentification({ summary }: { summary: IdentificationSummary }) {
  const lineCount = 2 + Number(summary.hasLatinName) + Math.min(2, summary.originCount) + Number(summary.hasFamily) + Number(summary.relatedCount > 0) + Number(summary.similarCount > 0) + Number(summary.identityTermCount > 0);
  return <div className="data-card-mini-identification" style={{ flexGrow: clamp(lineCount, 5, 10) }}>
    <span className="data-card-mini-name"/>
    {Array.from({ length: clamp(lineCount, 4, 9) }, (_, index) => <span className="data-card-mini-line" style={{ width: `${58 + index % 3 * 12}%` }} key={index}/>) }
  </div>;
}

function MiniSection({ section }: { section: SectionModel }) {
  return <div className="data-card-mini-section" style={{ flexGrow: section.weight }}>
    <span className="data-card-mini-heading" style={{ width: `${section.titleWidth}%` }}/>
    <div className="data-card-mini-blocks">
      {section.blocks.map((block, index) => <MiniBlockView block={block} key={`${block.type}-${index}`}/>) }
    </div>
  </div>;
}

function MiniBlockView({ block }: { block: MiniBlock }) {
  if (block.type === "image") return <span className="data-card-mini-image" style={{ width: `${block.width}%`, marginLeft: `${Math.min(block.left, 100 - block.width)}%` }}/>
  if (block.type === "table") return <span className="data-card-mini-table" style={{ "--mini-rows": block.rows, "--mini-columns": block.columns } as CSSProperties}/>;
  if (block.type === "text") return <span className="data-card-mini-text">{Array.from({ length: block.lines }, (_, index) => <i style={{ width: `${index === block.lines - 1 ? 61 : 92 - index % 2 * 8}%` }} key={index}/>)}</span>;
  return <span className="data-card-mini-list">{block.lines.map((line, index) => <i style={{ marginLeft: `${line.depth * 7}%`, width: `${Math.max(22, line.width - line.depth * 5)}%` }} key={index}/>)}</span>;
}

function flattenItems(items: StudyItem[], depth = 0): { depth: number; width: number }[] {
  return items.flatMap((item) => [{ depth, width: clamp(34 + item.text.length * 2.4, 42, 96) }, ...flattenItems(item.children ?? [], depth + 1)]);
}

function blockWeight(block: MiniBlock) {
  if (block.type === "image") return 5;
  if (block.type === "table") return Math.max(4, block.rows);
  if (block.type === "text") return Math.max(2, block.lines);
  return Math.max(2, block.lines.length * .75);
}

function imageWidth(size: Extract<StudyBlock, { type: "image" }>["size"]) { return { small: 32, medium: 50, large: 74, full: 100 }[size]; }
function alignedLeft(align: Extract<StudyBlock, { type: "image" }>["align"], width: number) { return align === "right" ? 100 - width : align === "center" ? (100 - width) / 2 : 0; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
