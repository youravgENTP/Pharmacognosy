"use client";

import { Bold, Check, ChevronDown, ChevronRight, Highlighter, Italic, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ImportanceLevel, StudyItem, StudySection } from "@/lib/db/schema";

type DrugDraft = {
  koreanName: string; latinName: string | null; origin: string | null; scientificName: string | null;
  medicinalPart: string | null; importance: ImportanceLevel; sections: StudySection[];
};
type Taxon = { id: string; name: string; kind: string };
type TaxonEdge = { parentId: string; childId: string };
type FieldDefinition = { id: string; name: string; kind: "default" | "custom"; position: number; active: boolean };
type RelatedDrug = { id: string; drugId: string; catalogIndex: number | null; name: string };
type AvailableDrug = { id: string; catalogIndex: number | null; name: string };
const importanceOptions: ImportanceLevel[] = ["중요", "중간", "비중요", "연관"];

export function DrugEditor({ id, initial, family, relatedDrugs: initialRelatedDrugs = [], availableDrugs: initialAvailableDrugs = [], modal = false }: { id: string; initial: DrugDraft; family: string | null; relatedDrugs?: RelatedDrug[]; availableDrugs?: AvailableDrug[]; modal?: boolean }) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<"dirty" | "saving" | "saved" | "error">("saved");
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [constituentData, setConstituentData] = useState<{ nodes: Taxon[]; edges: TaxonEdge[] }>({ nodes: [], edges: [] });
  const [pickerSectionId, setPickerSectionId] = useState<string>();
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [relatedPickerOpen, setRelatedPickerOpen] = useState(false);
  const [relatedDrugs, setRelatedDrugs] = useState(initialRelatedDrugs);
  const [availableDrugs, setAvailableDrugs] = useState(initialAvailableDrugs);
  const first = useRef(true);
  const draftRef = useRef(draft);
  const revision = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  draftRef.current = draft;

  async function persist(value = draftRef.current, expectedRevision = revision.current) {
    setStatus("saving");
    try {
      const response = await fetch(`/api/drugs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error();
      if (revision.current === expectedRevision) setStatus("saved");
    } catch { setStatus("error"); }
  }
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    revision.current += 1;
    const expectedRevision = revision.current;
    setStatus("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(draft, expectedRevision), 700);
    return () => window.clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, id]);
  useEffect(() => {
    Promise.all([fetch("/api/constituent-taxa").then((response) => response.json()), fetch("/api/field-definitions").then((response) => response.json())])
      .then(([taxa, fields]) => { setConstituentData({ nodes: taxa.nodes ?? [], edges: taxa.edges ?? [] }); setFieldDefinitions(fields ?? []); })
      .catch(() => undefined);
  }, []);

  const setField = <K extends keyof DrugDraft>(key: K, value: DrugDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  function fieldName(section: StudySection) { return fieldDefinitions.find((field) => field.id === section.fieldDefinitionId)?.name ?? section.title; }
  function updateSection(sectionId: string, patch: Partial<StudySection>) { setField("sections", draft.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section)); }
  function removeSection(sectionId: string) { if (window.confirm("이 생약에서 이 필드와 내용을 삭제할까요?")) setField("sections", draft.sections.filter((section) => section.id !== sectionId)); }
  function addDefinitions(selectedIds: string[]) {
    const existing = new Set(draft.sections.map((section) => section.fieldDefinitionId).filter(Boolean));
    const additions = fieldDefinitions.filter((field) => selectedIds.includes(field.id) && !existing.has(field.id)).map((field) => ({ id: crypto.randomUUID(), fieldDefinitionId: field.id, title: field.name, items: [] }));
    setField("sections", sortSections([...draft.sections, ...additions], fieldDefinitions));
    setFieldPickerOpen(false);
  }
  async function addRelated(targetId: string) {
    const target = availableDrugs.find((drug) => drug.id === targetId);
    if (!target) return;
    const response = await fetch(`/api/drugs/${id}/relationships`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId }) });
    if (!response.ok) return;
    const created = await response.json();
    setRelatedDrugs((current) => [...current, { id: created.id, drugId: target.id, catalogIndex: target.catalogIndex, name: target.name }]);
    setAvailableDrugs((current) => current.filter((drug) => drug.id !== targetId));
    setRelatedPickerOpen(false);
  }
  async function removeRelated(relationshipId: string) {
    const related = relatedDrugs.find((item) => item.id === relationshipId);
    await fetch(`/api/drugs/${id}/relationships`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationshipId }) });
    setRelatedDrugs((current) => current.filter((item) => item.id !== relationshipId));
    if (related) setAvailableDrugs((current) => [...current, { id: related.drugId, catalogIndex: related.catalogIndex, name: related.name }].sort(sortDrug));
  }
  function chooseConstituent(taxon: Taxon) {
    if (!pickerSectionId) return;
    const section = draft.sections.find((item) => item.id === pickerSectionId);
    if (section) updateSection(section.id, { items: [...section.items, { ...newItem(), text: taxon.name, linkedConstituentId: taxon.id }] });
    setPickerSectionId(undefined);
  }
  function saveNow() { window.clearTimeout(timer.current); void persist(draftRef.current, revision.current); }

  return <div className={`drug-profile ${modal ? "in-modal" : "standalone"}`}>
    <section className="profile-identity indicator-field">
      <div className="profile-name-row">
        <div className="profile-name-fields"><input className="profile-korean-name" value={draft.koreanName} onChange={(event) => setField("koreanName", event.target.value)} aria-label="생약명"/><input className="profile-latin-name" value={draft.latinName ?? ""} onChange={(event) => setField("latinName", event.target.value)} placeholder="Latin name" aria-label="Latin name"/></div>
        <div className="profile-controls"><select className={`importance-select importance-${importanceClass(draft.importance)}`} value={draft.importance} onChange={(event) => setField("importance", event.target.value as ImportanceLevel)}>{importanceOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select><button className={`save-status ${status}`} onClick={saveNow} disabled={status === "saved"}><span className="dot"/>{status === "saved" ? "Saved" : "Save"}</button></div>
      </div>
      <div className="identity-lines">
        <IndicatorLine label="기원"><input value={draft.origin ?? ""} onChange={(event) => setField("origin", event.target.value)} placeholder="기원을 입력하세요"/></IndicatorLine>
        <IndicatorLine label="과"><span>{family || "등록된 과 정보 없음"}</span></IndicatorLine>
        <IndicatorLine label="연관생약"><div className="related-editor">{[...relatedDrugs].sort(sortDrug).map((related) => <span className="profile-chip" key={related.id}>({related.catalogIndex ?? "—"}, {related.name})<button onClick={() => removeRelated(related.id)} aria-label={`${related.name} 연결 해제`}><X size={12}/></button></span>)}<button className="inline-add" onClick={() => setRelatedPickerOpen(true)}><Plus size={14}/> 연결</button></div></IndicatorLine>
      </div>
    </section>
    <div className="profile-sections">{draft.sections.map((section) => {
      const name = fieldName(section);
      return <section className="profile-field" key={section.id}>
        <div className="profile-field-title"><h2>{name}</h2><button className="field-remove" onClick={() => removeSection(section.id)} title="이 생약에서 필드 삭제" aria-label={`${name} 삭제`}><X size={17}/></button></div>
        <HierarchyEditor items={section.items} onChange={(items) => updateSection(section.id, { items })}/>
        {name === "성분" ? <div className="field-add-actions constituent-actions"><button className="add-line" onClick={() => updateSection(section.id, { items: [...section.items, newItem()] })}><Plus size={14}/> 새 항목 추가</button><button className="taxonomy-picker-button" onClick={() => setPickerSectionId(section.id)}><Plus size={14}/> 성분 체계에서 추가</button></div> : null}
      </section>;
    })}</div>
    <div className="add-field-row"><button onClick={() => setFieldPickerOpen(true)}><Plus size={15}/> Field 추가</button></div>
    {pickerSectionId ? <ConstituentPicker nodes={constituentData.nodes} edges={constituentData.edges} onChoose={chooseConstituent} onClose={() => setPickerSectionId(undefined)}/> : null}
    {relatedPickerOpen ? <RelatedDrugPicker drugs={availableDrugs} onChoose={addRelated} onClose={() => setRelatedPickerOpen(false)}/> : null}
    {fieldPickerOpen ? <FieldPicker definitions={fieldDefinitions} sections={draft.sections} onDefinitionsChange={setFieldDefinitions} onAdd={addDefinitions} onClose={() => setFieldPickerOpen(false)}/> : null}
  </div>;
}

function IndicatorLine({ label, children }: { label: string; children: React.ReactNode }) { return <div className="identity-line indicator-line"><strong>{label}</strong><span className="identity-colon">:</span>{children}</div>; }
function newItem(): StudyItem { return { id: crypto.randomUUID(), text: "" }; }
function importanceClass(value: ImportanceLevel) { return { 중요: "important", 중간: "medium", 비중요: "low", 연관: "related" }[value]; }
function sortDrug(a: { catalogIndex: number | null; name: string }, b: { catalogIndex: number | null; name: string }) { return (a.catalogIndex ?? 9999) - (b.catalogIndex ?? 9999) || a.name.localeCompare(b.name, "ko"); }
function sortSections(sections: StudySection[], definitions: FieldDefinition[]) {
  const byId = new Map(definitions.map((field) => [field.id, field]));
  return [...sections].sort((a, b) => {
    const left = a.fieldDefinitionId ? byId.get(a.fieldDefinitionId) : undefined;
    const right = b.fieldDefinitionId ? byId.get(b.fieldDefinitionId) : undefined;
    const leftGroup = left?.kind === "custom" || !left ? 1 : 0;
    const rightGroup = right?.kind === "custom" || !right ? 1 : 0;
    return leftGroup - rightGroup || (left?.position ?? 9999) - (right?.position ?? 9999);
  });
}

function HierarchyEditor({ items, onChange }: { items: StudyItem[]; onChange: (items: StudyItem[]) => void }) {
  function change(id: string, patch: Partial<StudyItem>) { onChange(updateItem(items, id, patch)); }
  function keyAction(event: React.KeyboardEvent<HTMLInputElement>, id: string) {
    if (event.key === "Tab") { event.preventDefault(); onChange(event.shiftKey ? outdentItem(items, id) : indentItem(items, id)); }
    if (event.key === "Enter") { event.preventDefault(); onChange(addAfter(items, id, newItem())); }
    if (event.key === "Backspace" && !event.currentTarget.value) { event.preventDefault(); onChange(removeItem(items, id)); }
  }
  return <div className="hierarchy-editor"><HierarchyRows items={items} depth={0} onChange={change} onKeyAction={keyAction} onRemove={(itemId) => onChange(removeItem(items, itemId))}/></div>;
}
function HierarchyRows({ items, depth, onChange, onKeyAction, onRemove }: { items: StudyItem[]; depth: number; onChange: (id: string, patch: Partial<StudyItem>) => void; onKeyAction: (event: React.KeyboardEvent<HTMLInputElement>, id: string) => void; onRemove: (id: string) => void }) {
  return <>{items.map((item, index) => <div className="hierarchy-node" key={item.id}><div className={`hierarchy-row depth-${Math.min(depth, 3)}`}><span className="hierarchy-marker">{marker(depth, index)}</span><input style={{ fontWeight: item.bold ? 750 : 400, fontStyle: item.italic ? "italic" : "normal", background: item.highlight ? "#594f24" : "transparent" }} value={item.text} placeholder="내용을 입력하세요" onChange={(event) => onChange(item.id, { text: event.target.value })} onKeyDown={(event) => onKeyAction(event, item.id)}/><div className="hierarchy-actions"><button className={item.bold ? "active" : ""} onClick={() => onChange(item.id, { bold: !item.bold })} title="굵게"><Bold size={13}/></button><button className={item.italic ? "active" : ""} onClick={() => onChange(item.id, { italic: !item.italic })} title="기울임"><Italic size={13}/></button><button className={item.highlight ? "active" : ""} onClick={() => onChange(item.id, { highlight: !item.highlight })} title="강조"><Highlighter size={13}/></button><button onClick={() => onRemove(item.id)} title="삭제"><Trash2 size={13}/></button></div></div>{item.children?.length ? <div className="hierarchy-children"><HierarchyRows items={item.children} depth={depth + 1} onChange={onChange} onKeyAction={onKeyAction} onRemove={onRemove}/></div> : null}</div>)}</>;
}
function marker(depth: number, index: number) { if (depth === 0) return `${toRoman(index + 1).toLowerCase()})`; if (depth === 1) return index < 20 ? String.fromCodePoint(0x2460 + index) : `(${index + 1})`; if (depth === 2) return `${String.fromCharCode(97 + (index % 26))})`; return "•"; }
function toRoman(value: number) { const pairs: [number, string][] = [[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]]; let number = value, result = ""; for (const [amount, symbol] of pairs) while (number >= amount) { result += symbol; number -= amount; } return result; }
function updateItem(items: StudyItem[], id: string, patch: Partial<StudyItem>): StudyItem[] { return items.map((item) => item.id === id ? { ...item, ...patch } : { ...item, ...(item.children ? { children: updateItem(item.children, id, patch) } : {}) }); }
function removeItem(items: StudyItem[], id: string): StudyItem[] { return items.filter((item) => item.id !== id).map((item) => ({ ...item, ...(item.children ? { children: removeItem(item.children, id) } : {}) })); }
function findPath(items: StudyItem[], id: string, prefix: number[] = []): number[] | null { for (let index = 0; index < items.length; index++) { if (items[index].id === id) return [...prefix, index]; const nested = items[index].children ? findPath(items[index].children!, id, [...prefix, index]) : null; if (nested) return nested; } return null; }
function listAt(root: StudyItem[], parentPath: number[]): StudyItem[] { let list = root; for (const index of parentPath) { list[index].children ??= []; list = list[index].children!; } return list; }
function mutateTree(items: StudyItem[], mutate: (root: StudyItem[]) => void) { const next = structuredClone(items); mutate(next); return next; }
function indentItem(items: StudyItem[], id: string) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path) return; const index = path.at(-1)!; if (index === 0) return; const list = listAt(root, path.slice(0, -1)); const [item] = list.splice(index, 1); const previous = list[index - 1]; previous.children ??= []; previous.children.push(item); }); }
function outdentItem(items: StudyItem[], id: string) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path || path.length < 2) return; const index = path.at(-1)!; const parentPath = path.slice(0, -1); const parentIndex = parentPath.at(-1)!; const list = listAt(root, parentPath); const [item] = list.splice(index, 1); const parentList = listAt(root, parentPath.slice(0, -1)); parentList.splice(parentIndex + 1, 0, item); }); }
function addAfter(items: StudyItem[], id: string, newValue: StudyItem) { return mutateTree(items, (root) => { const path = findPath(root, id); if (!path) return; const list = listAt(root, path.slice(0, -1)); list.splice(path.at(-1)! + 1, 0, newValue); }); }

function PickerShell({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="constituent-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="constituent-picker"><header><div><span className="picker-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="닫기"><X size={19}/></button></header>{children}</div></div>;
}
function ConstituentPicker({ nodes, edges, onChoose, onClose }: { nodes: Taxon[]; edges: TaxonEdge[]; onChoose: (node: Taxon) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(nodes.filter((node) => node.kind === "pathway").map((node) => node.id)));
  const roots = nodes.filter((node) => !edges.some((edge) => edge.childId === node.id));
  const matches = query.trim() ? nodes.filter((node) => node.name.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <PickerShell eyebrow="성분 데이터베이스" title="성분 체계에서 추가" onClose={onClose}><div className="search-wrap picker-search"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="경로, 성분군, 개별 성분 검색" autoFocus/></div><div className="picker-tree">{query.trim() ? matches.map((node) => <PickerRow node={node} key={node.id} onChoose={onChoose}/>) : roots.map((node) => <PickerBranch key={node.id} node={node} nodes={nodes} edges={edges} depth={0} path={new Set()} expanded={expanded} setExpanded={setExpanded} onChoose={onChoose}/>)}</div></PickerShell>;
}
function PickerBranch({ node, nodes, edges, depth, path, expanded, setExpanded, onChoose }: { node: Taxon; nodes: Taxon[]; edges: TaxonEdge[]; depth: number; path: Set<string>; expanded: Set<string>; setExpanded: (value: Set<string>) => void; onChoose: (node: Taxon) => void }) {
  if (path.has(node.id)) return null;
  const children = edges.filter((edge) => edge.parentId === node.id).map((edge) => nodes.find((item) => item.id === edge.childId)).filter(Boolean) as Taxon[];
  const open = expanded.has(node.id); const nextPath = new Set(path).add(node.id);
  return <div><div className="picker-row" style={{ paddingLeft: 10 + depth * 22 }}><button className="picker-toggle" onClick={() => { const next = new Set(expanded); if (open) next.delete(node.id); else next.add(node.id); setExpanded(next); }}>{children.length ? (open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>) : <span/>}</button><PickerRow node={node} onChoose={onChoose}/></div>{open ? children.map((child) => <PickerBranch key={`${node.id}-${child.id}`} node={child} nodes={nodes} edges={edges} depth={depth + 1} path={nextPath} expanded={expanded} setExpanded={setExpanded} onChoose={onChoose}/>) : null}</div>;
}
function PickerRow({ node, onChoose }: { node: Taxon; onChoose: (node: Taxon) => void }) { return <button className="picker-label" onClick={() => onChoose(node)}><span>{node.name}</span><small>{kindLabel(node.kind)}</small></button>; }
function kindLabel(kind: string) { return { pathway: "생합성 경로", class: "성분군", subclass: "하위 성분군", compound: "개별 성분" }[kind] ?? kind; }

function RelatedDrugPicker({ drugs, onChoose, onClose }: { drugs: AvailableDrug[]; onChoose: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const visible = drugs.filter((drug) => !query.trim() || drug.name.includes(query.trim()) || String(drug.catalogIndex ?? "").includes(query.trim())).sort(sortDrug);
  return <PickerShell eyebrow="생약 데이터베이스" title="연관생약 추가" onClose={onClose}><div className="search-wrap picker-search"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="인덱스 또는 생약명 검색" autoFocus/></div><div className="related-picker-list">{visible.map((drug) => <button key={drug.id} onClick={() => onChoose(drug.id)}><strong>({drug.catalogIndex ?? "—"}, {drug.name})</strong><span>연관생약으로 추가</span></button>)}</div></PickerShell>;
}

function FieldPicker({ definitions, sections, onDefinitionsChange, onAdd, onClose }: { definitions: FieldDefinition[]; sections: StudySection[]; onDefinitionsChange: (value: FieldDefinition[]) => void; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const present = new Set(sections.map((section) => section.fieldDefinitionId).filter(Boolean));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const defaults = definitions.filter((field) => field.kind === "default").sort((a, b) => a.position - b.position);
  const custom = definitions.filter((field) => field.kind === "custom").sort((a, b) => a.position - b.position);
  function toggle(id: string) { if (present.has(id)) return; const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); }
  async function create() {
    if (!newName.trim()) return;
    const response = await fetch("/api/field-definitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
    const data = await response.json();
    if (!response.ok) { window.alert(data.error); return; }
    onDefinitionsChange([...definitions, data]); setSelected((current) => new Set(current).add(data.id)); setNewName("");
  }
  async function rename(field: FieldDefinition) {
    const name = window.prompt("새 필드 이름", field.name)?.trim(); if (!name) return;
    const response = await fetch(`/api/field-definitions/${field.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await response.json(); if (!response.ok) { window.alert(data.error); return; }
    onDefinitionsChange(definitions.map((item) => item.id === field.id ? data : item));
  }
  async function archive(field: FieldDefinition) {
    if (!window.confirm(`“${field.name}”을 목록에서 삭제할까요? 기존 생약의 내용은 유지됩니다.`)) return;
    const response = await fetch(`/api/field-definitions/${field.id}`, { method: "DELETE" }); if (!response.ok) return;
    onDefinitionsChange(definitions.filter((item) => item.id !== field.id)); setSelected((current) => { const next = new Set(current); next.delete(field.id); return next; });
  }
  return <PickerShell eyebrow="Field Library" title="Field 추가" onClose={onClose}><div className="field-picker-body"><FieldGroup title="기본 항목" fields={defaults} present={present} selected={selected} onToggle={toggle}/><FieldGroup title="사용자 정의 항목" fields={custom} present={present} selected={selected} onToggle={toggle} onRename={rename} onArchive={archive}/><div className="new-field-card"><Plus size={18}/><input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="새로운 항목 이름"/><button onClick={() => void create()}>추가</button></div></div><footer className="field-picker-footer"><span>{selected.size}개 선택</span><button disabled={!selected.size} onClick={() => onAdd([...selected])}>선택 항목 추가</button></footer></PickerShell>;
}
function FieldGroup({ title, fields, present, selected, onToggle, onRename, onArchive }: { title: string; fields: FieldDefinition[]; present: Set<string | undefined>; selected: Set<string>; onToggle: (id: string) => void; onRename?: (field: FieldDefinition) => void; onArchive?: (field: FieldDefinition) => void }) {
  return <section className="field-picker-group"><h3>{title}</h3><div className="field-card-grid">{fields.map((field) => { const added = present.has(field.id); return <div className={`field-choice-card ${selected.has(field.id) ? "selected" : ""} ${added ? "present" : ""}`} key={field.id} role="button" tabIndex={0} onClick={() => onToggle(field.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onToggle(field.id); }}><span>{field.name}</span>{selected.has(field.id) || added ? <Check className="field-check" size={16}/> : null}{added ? <small>추가됨</small> : null}{field.kind === "custom" ? <span className="field-card-actions"><button onClick={(event) => { event.stopPropagation(); onRename?.(field); }} title="수정"><Pencil size={13}/></button><button onClick={(event) => { event.stopPropagation(); onArchive?.(field); }} title="삭제"><Trash2 size={13}/></button></span> : null}</div>; })}</div></section>;
}
