"use client";

import { Check, ChevronDown, ChevronRight, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDrugIndex } from "@/lib/drug-index";

type Importance = "중요" | "중간" | "비중요";
type Drug = { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; origin: string | null; scientificName: string | null; importance: Importance };
type Category = { id: string; name: string; slug: string; drugs: Drug[] };
const importanceOrder: Importance[] = ["중요", "중간", "비중요"];

export function DrugBoard({ categories }: { categories: Category[] }) {
  const router = useRouter(); const [query, setQuery] = useState(""); const [filterOpen, setFilterOpen] = useState(false);
  const [importanceFilters, setImportanceFilters] = useState<Set<Importance>>(new Set(importanceOrder)); const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); const [referenceCreatorOpen, setReferenceCreatorOpen] = useState(false);
  const filtered = useMemo(() => { const needle = query.trim().toLocaleLowerCase(); return categories.map((category) => ({ ...category, drugs: category.drugs.filter((drug) => importanceFilters.has(drug.importance) && (!needle || [formatDrugIndex(drug.catalogIndex, drug.referenceIndex), drug.koreanName, drug.latinName, drug.origin, drug.scientificName].some((value) => value?.toLocaleLowerCase().includes(needle)))) })).filter((category) => category.drugs.length || (category.slug === "reference" && !needle)); }, [categories, query, importanceFilters]);
  const total = categories.reduce((sum, category) => sum + category.drugs.length, 0);
  function toggleFilter(value: Importance) { setImportanceFilters((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }); }
  function toggleGroup(key: string) { setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  return <>
    <header className="db-header"><div><h1>Herb Garden</h1><p className="subtitle">{total}개의 생약을 중요도와 인덱스 순으로 탐색하세요.</p></div><div className="db-tools"><div className="search-wrap"><Search size={18}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="생약명, Latin name, 기원 검색" aria-label="생약 검색"/></div><div className="filter-anchor"><button className={`filter-button ${importanceFilters.size < importanceOrder.length ? "active" : ""}`} onClick={() => setFilterOpen((value) => !value)}><SlidersHorizontal size={17}/> 필터{importanceFilters.size < importanceOrder.length ? ` · ${importanceFilters.size}` : ""}</button>{filterOpen ? <div className="filter-popover"><strong>중요도</strong>{importanceOrder.map((value) => <button key={value} onClick={() => toggleFilter(value)}><span className={`filter-check ${importanceFilters.has(value) ? "checked" : ""}`}>{importanceFilters.has(value) ? <Check size={13}/> : null}</span>{value}</button>)}</div> : null}</div></div></header>
    {filtered.length ? <div className="board-shell"><div className="category-board grouped-board">{filtered.map((category) => <section className="category-column grouped-column" key={category.id}><header className="category-header"><h2>{category.name}</h2><span className="count">{category.drugs.length}</span></header><div className="category-container">{importanceOrder.map((importance) => { const drugs = category.drugs.filter((drug) => drug.importance === importance); if (!drugs.length) return null; const key = `${category.id}-${importance}`; const isCollapsed = collapsed.has(key); return <section className={`importance-group group-${importanceClass(importance)}`} key={importance}><button className="importance-group-header" onClick={() => toggleGroup(key)}>{isCollapsed ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}<span>{importance}</span><small>{drugs.length}</small></button>{!isCollapsed ? <div className="group-drugs">{drugs.map((drug) => <Link href={`/drugs/${drug.id}`} scroll={false} className="group-drug-row" key={drug.id}><span className="drug-row-main"><b>{formatDrugIndex(drug.catalogIndex, drug.referenceIndex)}</b><strong>{drug.koreanName}</strong></span>{drug.latinName ? <small>{drug.latinName}</small> : null}</Link>)}</div> : null}</section>; })}{category.slug === "reference" ? <button className="reference-add-card" onClick={() => setReferenceCreatorOpen(true)}><Plus size={16}/> 생약 추가</button> : null}</div></section>)}</div></div> : <div className="empty">현재 검색과 필터 조건에 맞는 생약이 없습니다.</div>}
    {referenceCreatorOpen ? <ReferenceDrugCreator onClose={() => setReferenceCreatorOpen(false)} onCreated={(id) => { setReferenceCreatorOpen(false); router.push(`/drugs/${id}`, { scroll: false }); router.refresh(); }}/>: null}
  </>;
}

function importanceClass(value: Importance) { return { 중요: "important", 중간: "medium", 비중요: "low" }[value]; }

function ReferenceDrugCreator({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch("/api/reference-drugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ koreanName: name.trim() }) });
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await response.json() : null;
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : "생약을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!body?.id) {
        setError("서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onCreated(body.id);
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }
  return <div className="constituent-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="reference-create-modal" onSubmit={submit}><header><div><h2>참고 생약 추가</h2><p>시험범위 외 참고류에 새 R 인덱스로 추가됩니다.</p></div><button type="button" onClick={onClose}><X size={18}/></button></header><label>생약명<input value={name} onChange={(event) => setName(event.target.value)} placeholder="생약명" autoFocus/></label>{error ? <p className="image-upload-error">{error}</p> : null}<footer><button type="button" onClick={onClose}>취소</button><button className="primary" disabled={saving}>{saving ? "추가 중…" : "추가"}</button></footer></form></div>;
}
