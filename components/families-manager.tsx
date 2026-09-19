"use client";

import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrugEditor } from "@/components/drug-editor";
import { StudyContentEditor } from "@/components/study-content-editor";
import type { ImportanceLevel, OriginPlant, StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import { formatDrugIndex } from "@/lib/drug-index";

type FamilyDrug = { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; categoryId: string | null; categoryName: string };
type Family = { id: string; koreanName: string; scientificName: string; acceptedScientificName: string | null; summary: StudyItem[]; summaryBlocks: StudyBlock[]; drugs: FamilyDrug[] };
type Selection = { type: "family"; id: string } | { type: "drug"; id: string };
type DrugProfile = {
  id: string; koreanName: string; latinName: string | null; origin: string | null; origins: OriginPlant[]; scientificName: string | null;
  medicinalPart: string | null; familyId: string | null; importance: ImportanceLevel; sections: StudySection[]; family: string | null;
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
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return families;
    return families.filter((family) => [family.koreanName, family.scientificName, family.acceptedScientificName, ...family.drugs.flatMap((drug) => [drug.koreanName, drug.latinName])].some((value) => value?.toLocaleLowerCase().includes(needle)));
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
        const familyOpen = expandedFamilies.has(family.id);
        const grouped = groupByCategory(family.drugs);
        return <div className="family-branch" key={family.id}>
          <div className={`family-tree-row level-family ${selection?.type === "family" && selection.id === family.id ? "selected" : ""}`}>
            <button className="family-chevron" onClick={() => toggle(setExpandedFamilies, family.id)} aria-label={`${family.koreanName} ${familyOpen ? "접기" : "펼치기"}`}>{family.drugs.length ? (familyOpen ? <ChevronDown size={17}/> : <ChevronRight size={17}/>) : <span/>}</button>
            <button className="family-entity" onClick={() => setSelection({ type: "family", id: family.id })}><span>{family.koreanName}<em>{family.scientificName}</em></span><small>{family.drugs.length}</small></button>
          </div>
          {familyOpen ? <div className="family-tree-children">{grouped.map((category) => {
            const key = `${family.id}:${category.id}`; const categoryOpen = expandedCategories.has(key);
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
    <header className="family-card-header"><div className="family-card-names"><input className="family-korean-name" value={draft.koreanName} onChange={(event) => change("koreanName", event.target.value)}/><input className="family-scientific-name" value={draft.scientificName} onChange={(event) => change("scientificName", event.target.value)} aria-label="Scientific family name"/><label>Accepted name<input value={draft.acceptedScientificName ?? ""} onChange={(event) => change("acceptedScientificName", event.target.value || null)} placeholder="선택 사항"/></label></div><span className={`status ${status}`}><span className="dot"/>{status === "saved" ? "Saved" : status === "saving" ? "Saving" : status === "error" ? "Error" : "Save"}</span></header>
    <section className="family-summary"><div className="family-summary-title"><h2>Summary</h2><span>i) → ① → a) → •</span></div><StudyContentEditor items={draft.summary} blocks={draft.summaryBlocks} mode="hierarchy4" onChange={({ items, blocks }) => { const next = { ...draft, summary: items, summaryBlocks: blocks }; setDraft(next); onUpdate(next); }}/></section>
  </article>;
}

function DrugDetail({ id }: { id: string }) {
  const [drug, setDrug] = useState<DrugProfile>(); const [error, setError] = useState(false);
  useEffect(() => { const controller = new AbortController(); setDrug(undefined); setError(false); fetch(`/api/drugs/${id}`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then(setDrug).catch((reason) => { if (reason.name !== "AbortError") setError(true); }); return () => controller.abort(); }, [id]);
  if (error) return <div className="panel family-empty">생약 카드를 불러오지 못했습니다.</div>;
  if (!drug) return <div className="panel family-empty">불러오는 중…</div>;
  return <DrugEditor key={drug.id} id={drug.id} family={drug.family} relatedDrugs={drug.relatedDrugs} similarDrugs={drug.similarDrugs} availableDrugs={drug.availableDrugs} initial={{ koreanName: drug.koreanName, latinName: drug.latinName, origin: drug.origin, origins: drug.origins, scientificName: drug.scientificName, medicinalPart: drug.medicinalPart, familyId: drug.familyId, importance: drug.importance, sections: drug.sections }}/>;
}
