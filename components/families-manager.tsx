"use client";

import { ChevronDown, ChevronRight, Download, FileText, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrugEditor } from "@/components/drug-editor";
import { StudyContentEditor } from "@/components/study-content-editor";
import type { ImportanceLevel, OriginPlant, StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import { formatDrugIndex } from "@/lib/drug-index";
import { includesSearch, normalizeSearch } from "@/lib/search";

type FamilyDrug = { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; categoryId: string | null; categoryName: string };
type Family = { id: string; koreanName: string; scientificName: string; acceptedScientificName: string | null; summary: StudyItem[]; summaryBlocks: StudyBlock[]; drugs: FamilyDrug[] };
type Selection = { type: "family"; id: string } | { type: "drug"; id: string };
type DrugProfile = {
  id: string; koreanName: string; latinName: string | null; origin: string | null; origins: OriginPlant[]; scientificName: string | null;
  medicinalPart: string | null; familyId: string | null; importance: ImportanceLevel; sections: StudySection[]; family: string | null;
  identityTerms: { id: string; name: string }[];
  relatedDrugs: { id: string; drugId: string; catalogIndex: number | null; referenceIndex: number | null; name: string }[];
  similarDrugs: { id: string; drugId: string; catalogIndex: number | null; referenceIndex: number | null; name: string }[];
  availableDrugs: { id: string; catalogIndex: number | null; referenceIndex: number | null; name: string; latinName?: string | null }[];
};

export function FamiliesManager({ initialFamilies }: { initialFamilies: Family[] }) {
  const [families, setFamilies] = useState(initialFamilies);
  const [selection, setSelection] = useState<Selection | undefined>(initialFamilies[0] ? { type: "family", id: initialFamilies[0].id } : undefined);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set(initialFamilies[0] ? [initialFamilies[0].id] : []));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const selectedFamily = selection?.type === "family" ? families.find((family) => family.id === selection.id) : undefined;
  const visibleFamilies = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return families;
    return families.flatMap((family) => {
      const familyMatch = includesSearch(needle, [family.koreanName, family.scientificName, family.acceptedScientificName]);
      if (familyMatch) return [family];
      const categoryMatches = new Set(family.drugs.filter((drug) => includesSearch(needle, [drug.categoryName])).map((drug) => drug.categoryId ?? "uncategorized"));
      const drugs = family.drugs.filter((drug) => categoryMatches.has(drug.categoryId ?? "uncategorized") || includesSearch(needle, [drug.koreanName, drug.latinName, formatDrugIndex(drug.catalogIndex, drug.referenceIndex)]));
      return drugs.length ? [{ ...family, drugs }] : [];
    });
  }, [families, query]);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const updateFamily = useCallback((value: Family) => { setFamilies((current) => current.map((family) => family.id === value.id ? value : family)); }, []);
  async function createFamily(koreanName: string, scientificName: string) {
    const response = await fetch("/api/families", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ koreanName, scientificName }) });
    const data = await response.json();
    if (!response.ok) { window.alert(typeof data.error === "string" ? data.error : "Family를 추가하지 못했습니다."); return; }
    const created = { ...data, drugs: [] } as Family;
    setFamilies((current) => [...current, created].sort((a, b) => a.koreanName.localeCompare(b.koreanName, "ko")));
    setExpandedFamilies((current) => new Set(current).add(created.id));
    setSelection({ type: "family", id: created.id });
    setAdding(false);
  }

  return <div className="families-layout">
    <aside className="panel families-tree-panel">
      <div className="families-toolbar"><div className="search-wrap"><Search size={16}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="과 또는 생약 검색"/></div><button onClick={() => setAdding((value) => !value)}><Plus size={15}/> Family</button></div>
      {adding ? <NewFamilyForm onCreate={createFamily} onCancel={() => setAdding(false)}/> : null}
      <div className="families-tree">{visibleFamilies.map((family) => {
        const familyOpen = query.trim() ? true : expandedFamilies.has(family.id);
        const grouped = groupByCategory(family.drugs);
        return <div className="family-branch" key={family.id}>
          <div className={`family-tree-row level-family ${selection?.type === "family" && selection.id === family.id ? "selected" : ""}`}>
            <button className="family-chevron" onClick={() => toggle(setExpandedFamilies, family.id)} aria-label={`${family.koreanName} ${familyOpen ? "접기" : "펼치기"}`}>{family.drugs.length ? (familyOpen ? <ChevronDown size={17}/> : <ChevronRight size={17}/>) : <span/>}</button>
            <button className="family-entity" onClick={() => setSelection({ type: "family", id: family.id })}><span>{family.koreanName}<em>{family.scientificName}</em></span><small>{family.drugs.length}</small></button>
          </div>
          {familyOpen ? <div className="family-tree-children">{grouped.map((category) => {
            const key = `${family.id}:${category.id}`; const categoryOpen = query.trim() ? true : expandedCategories.has(key);
            return <div className="family-category-branch" key={key}>
              <div className="family-tree-row level-category"><span className="family-elbow"/><button className="family-chevron" onClick={() => toggle(setExpandedCategories, key)}>{categoryOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button><button className="family-entity" onClick={() => toggle(setExpandedCategories, key)}><span>{category.name}</span><small>{category.drugs.length}</small></button></div>
              {categoryOpen ? <div className="family-drug-children">{category.drugs.map((drug) => <div className={`family-tree-row level-drug ${selection?.type === "drug" && selection.id === drug.id ? "selected" : ""}`} key={drug.id}><span className="family-elbow"/><span className="family-leaf-space"/><button className="family-entity" onClick={() => setSelection({ type: "drug", id: drug.id })}><span><b>{formatDrugIndex(drug.catalogIndex, drug.referenceIndex)}</b>{drug.koreanName}<em>{drug.latinName}</em></span></button></div>)}</div> : null}
            </div>;
          })}</div> : null}
        </div>;
      })}</div>
    </aside>
    <main className="families-detail">
      {selectedFamily ? <FamilyCard key={selectedFamily.id} family={selectedFamily} onUpdate={updateFamily}/> : selection?.type === "drug" ? <DrugDetail id={selection.id}/> : <div className="panel family-empty">Family 또는 생약을 선택하세요.</div>}
    </main>
  </div>;
}

function groupByCategory(drugs: FamilyDrug[]) {
  return Array.from(drugs.reduce((map, drug) => {
    const id = drug.categoryId ?? "uncategorized";
    if (!map.has(id)) map.set(id, { id, name: drug.categoryName, drugs: [] as FamilyDrug[] });
    map.get(id)!.drugs.push(drug);
    return map;
  }, new Map<string, { id: string; name: string; drugs: FamilyDrug[] }>()).values());
}

function NewFamilyForm({ onCreate, onCancel }: { onCreate: (koreanName: string, scientificName: string) => Promise<void>; onCancel: () => void }) {
  const [koreanName, setKoreanName] = useState(""); const [scientificName, setScientificName] = useState("");
  return <form className="new-family-form" onSubmit={(event) => { event.preventDefault(); if (koreanName.trim() && scientificName.trim()) void onCreate(koreanName.trim(), scientificName.trim()); }}><input value={koreanName} onChange={(event) => setKoreanName(event.target.value)} placeholder="과 한글명" autoFocus/><input value={scientificName} onChange={(event) => setScientificName(event.target.value)} placeholder="Scientific name"/><div><button className="primary">추가</button><button type="button" onClick={onCancel}>취소</button></div></form>;
}

function FamilyCard({ family, onUpdate }: { family: Family; onUpdate: (family: Family) => void }) {
  const [draft, setDraft] = useState(family);
  const [status, setStatus] = useState<"dirty" | "saving" | "saved" | "error">("saved");
  const [exportOpen, setExportOpen] = useState(false);
  const first = useRef(true); const timer = useRef<number | undefined>(undefined); const revision = useRef(0);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    revision.current += 1; const currentRevision = revision.current; setStatus("dirty"); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setStatus("saving");
      const response = await fetch(`/api/families/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ koreanName: draft.koreanName, scientificName: draft.scientificName, acceptedScientificName: draft.acceptedScientificName, summary: draft.summary, summaryBlocks: draft.summaryBlocks }) });
      if (response.ok) { if (revision.current === currentRevision) setStatus("saved"); onUpdate(draft); } else setStatus("error");
    }, 650);
    return () => window.clearTimeout(timer.current);
  }, [draft, onUpdate]);
  function change<K extends keyof Family>(key: K, value: Family[K]) { const next = { ...draft, [key]: value }; setDraft(next); onUpdate(next); }
  return <article className="family-card panel">
    <header className="family-card-header"><div className="family-card-names"><input className="family-korean-name" value={draft.koreanName} onChange={(event) => change("koreanName", event.target.value)}/><input className="family-scientific-name" value={draft.scientificName} onChange={(event) => change("scientificName", event.target.value)} aria-label="Scientific family name"/><label>Accepted name<input value={draft.acceptedScientificName ?? ""} onChange={(event) => change("acceptedScientificName", event.target.value || null)} placeholder="선택 사항"/></label></div><div className="family-card-controls"><button className="data-card-export" disabled={status !== "saved" || !draft.drugs.length} onClick={() => setExportOpen(true)} title={status !== "saved" ? "저장이 완료된 뒤 내보낼 수 있습니다." : undefined}><Download size={14}/> Export</button><span className={`status ${status}`}><span className="dot"/>{status === "saved" ? "Saved" : status === "saving" ? "Saving" : status === "error" ? "Error" : "Save"}</span></div></header>
    <section className="family-summary"><div className="family-summary-title"><h2>Summary</h2><span>i) → ① → a) → •</span></div><StudyContentEditor items={draft.summary} blocks={draft.summaryBlocks} mode="hierarchy4" onChange={({ items, blocks }) => { const next = { ...draft, summary: items, summaryBlocks: blocks }; setDraft(next); onUpdate(next); }}/></section>
    {exportOpen ? <FamilyExportDialog family={draft} onClose={() => setExportOpen(false)}/> : null}
  </article>;
}

function FamilyExportDialog({ family, onClose }: { family: Family; onClose: () => void }) {
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [mnemonicMode, setMnemonicMode] = useState<"preferred" | "mine" | "none" | "all">("preferred");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function download() {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`/api/export/families/${family.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, columns, mnemonicMode }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.error === "string" ? body.error : "Family 파일을 생성하지 못했습니다."); }
      const blob = await response.blob();
      const expected = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
      if (!blob.size || blob.type !== expected) throw new Error(`${format.toUpperCase()} 응답 형식이 올바르지 않습니다.`);
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `HerbOverflow-${family.koreanName}.${format}`; anchor.style.display = "none";
      document.body.appendChild(anchor); anchor.click();
      window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 30_000);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Family 파일을 생성하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="constituent-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="family-export-dialog export-dialog"><header><span><FileText size={19}/><div><h2>Family Export</h2><p>{family.koreanName} · {family.scientificName} · {family.drugs.length}개 생약</p></div></span><button onClick={onClose} disabled={busy} aria-label="닫기"><X size={18}/></button></header><div className="family-export-options"><label>파일 형식<select value={format} onChange={(event) => setFormat(event.target.value as "docx" | "pdf")}><option value="docx">Word DOCX</option><option value="pdf">PDF</option></select></label><label>레이아웃<select value={columns} onChange={(event) => setColumns(Number(event.target.value) as 1 | 2)}><option value={1}>1 column</option><option value={2}>2 columns</option></select></label><label>암기법<select value={mnemonicMode} onChange={(event) => setMnemonicMode(event.target.value as typeof mnemonicMode)}><option value="preferred">Preferred/default mnemonic</option><option value="mine">My mnemonic</option><option value="none">No mnemonic</option><option value="all">All mnemonic versions</option></select></label></div><p>Family summary와 류별 소속 생약을 현재 Data Card 형식으로 내보냅니다.</p>{error ? <p className="data-export-error" role="alert">{error}</p> : null}<footer><button disabled={busy} onClick={onClose}>취소</button><button className="primary" disabled={busy} onClick={() => void download()}><Download size={15}/>{busy ? "생성 중…" : `${format.toUpperCase()} 내보내기`}</button></footer></section></div>;
}

function DrugDetail({ id }: { id: string }) {
  const [drug, setDrug] = useState<DrugProfile>(); const [error, setError] = useState(false);
  useEffect(() => { const controller = new AbortController(); setDrug(undefined); setError(false); fetch(`/api/drugs/${id}`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then(setDrug).catch((reason) => { if (reason.name !== "AbortError") setError(true); }); return () => controller.abort(); }, [id]);
  if (error) return <div className="panel family-empty">생약 카드를 불러오지 못했습니다.</div>;
  if (!drug) return <div className="panel family-empty">불러오는 중…</div>;
  return <DrugEditor key={drug.id} id={drug.id} family={drug.family} identityTerms={drug.identityTerms} relatedDrugs={drug.relatedDrugs} similarDrugs={drug.similarDrugs} availableDrugs={drug.availableDrugs} initial={{ koreanName: drug.koreanName, latinName: drug.latinName, origin: drug.origin, origins: drug.origins, scientificName: drug.scientificName, medicinalPart: drug.medicinalPart, familyId: drug.familyId, importance: drug.importance, sections: drug.sections }}/>;
}
