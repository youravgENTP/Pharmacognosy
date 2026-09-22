"use client";

import { Check, Download, FileText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDrugIndex } from "@/lib/drug-index";
import { sortExportDrugs, type ExportSortMode as SortMode } from "@/lib/export/drug-order";

type Importance = "중요" | "중간" | "비중요";
type Drug = { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; importance: Importance; categoryId: string | null; categoryName: string | null; categoryPosition: number | null };
type Format = "docx" | "pdf";
type MnemonicMode = "preferred" | "mine" | "none" | "all";

export function DataCardExport({ drugs, initialDrugId }: { drugs: Drug[]; initialDrugId?: string }) {
  const validInitial = initialDrugId && drugs.some((drug) => drug.id === initialDrugId) ? initialDrugId : undefined;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(validInitial ? [validInitial] : []));
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("index");
  const [format, setFormat] = useState<Format>("pdf");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [mnemonicMode, setMnemonicMode] = useState<MnemonicMode>("preferred");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; position: number; drugIds: string[] }>();
    for (const drug of drugs) if (drug.categoryId && drug.categoryName) {
      const current = map.get(drug.categoryId) ?? { id: drug.categoryId, name: drug.categoryName, position: drug.categoryPosition ?? Number.MAX_SAFE_INTEGER, drugIds: [] };
      current.drugIds.push(drug.id); map.set(drug.categoryId, current);
    }
    return [...map.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ko"));
  }, [drugs]);
  const sorted = useMemo(() => sortExportDrugs(drugs, sortMode), [drugs, sortMode]);
  const visible = useMemo(() => { const needle = query.trim().toLocaleLowerCase(); return needle ? sorted.filter((drug) => [formatDrugIndex(drug.catalogIndex, drug.referenceIndex), drug.koreanName, drug.latinName, drug.categoryName].some((value) => value?.toLocaleLowerCase().includes(needle))) : sorted; }, [query, sorted]);

  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function add(ids: string[]) { setSelected((current) => new Set([...current, ...ids])); }
  async function exportCards() {
    const drugIds = sorted.filter((drug) => selected.has(drug.id)).map((drug) => drug.id);
    if (!drugIds.length || busy) return;
    setBusy(true); setError(undefined);
    try {
      const response = await fetch("/api/export/drugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drugIds, format, columns, mnemonicMode }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.error === "string" ? body.error : "파일을 생성하지 못했습니다."); }
      const blob = await response.blob();
      if (!blob.size) throw new Error("생성된 파일이 비어 있습니다.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `HerbOverflow-DataCards.${format}`; anchor.style.display = "none";
      document.body.appendChild(anchor); anchor.click();
      window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 1500);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "파일을 생성하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="data-export-layout">
    <section className="panel data-export-picker">
      <div className="data-export-summary"><div><strong>{selected.size}</strong><span>개 Data Card 선택됨</span></div><button onClick={() => setSelected(new Set())} disabled={!selected.size}><X size={14}/> 선택 지우기</button></div>
      <div className="data-export-quick"><button onClick={() => setSelected(new Set(drugs.map((drug) => drug.id)))}>전체 생약</button>{categories.map((category) => <button key={category.id} onClick={() => add(category.drugIds)}>{category.name}<small>{category.drugIds.length}</small></button>)}</div>
      <div className="data-export-list-tools"><div className="search-wrap"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="생약명, Latin name, 인덱스 검색"/></div><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="정렬"><option value="index">Index order</option><option value="name">Korean name order</option><option value="importance">Importance order</option></select></div>
      <div className="data-export-drugs">{visible.map((drug) => <label key={drug.id} className={selected.has(drug.id) ? "selected" : ""}><input type="checkbox" checked={selected.has(drug.id)} onChange={() => toggle(drug.id)}/><span className="data-export-check">{selected.has(drug.id) ? <Check size={13}/> : null}</span><b>{formatDrugIndex(drug.catalogIndex, drug.referenceIndex)}</b><span><strong>{drug.koreanName}</strong><small>{[drug.latinName, drug.categoryName].filter(Boolean).join(" · ")}</small></span><em className={`importance-${importanceClass(drug.importance)}`}>{drug.importance}</em></label>)}</div>
    </section>
    <aside className="panel data-export-options"><header><FileText size={20}/><div><h2>Data Card Export</h2><p>채워진 필드를 현재 순서대로 내보냅니다.</p></div></header><label>파일 형식<select value={format} onChange={(event) => setFormat(event.target.value as Format)}><option value="pdf">PDF</option><option value="docx">DOCX</option></select></label><label>레이아웃<select value={columns} onChange={(event) => setColumns(Number(event.target.value) as 1 | 2)}><option value={1}>1 column</option><option value={2}>2 columns</option></select></label><label>암기법<select value={mnemonicMode} onChange={(event) => setMnemonicMode(event.target.value as MnemonicMode)}><option value="preferred">Preferred/default mnemonic</option><option value="mine">My mnemonic</option><option value="none">No mnemonic</option><option value="all">All mnemonic versions</option></select></label>{error ? <p className="data-export-error" role="alert">{error}</p> : null}<button className="data-export-submit" disabled={!selected.size || busy} onClick={() => void exportCards()}><Download size={16}/>{busy ? "파일 생성 중…" : `${selected.size}개 내보내기`}</button>{!selected.size ? <small>먼저 하나 이상의 Data Card를 선택하세요.</small> : null}</aside>
  </div>;
}

function importanceClass(value: Importance) { return { 중요: "important", 중간: "medium", 비중요: "low" }[value]; }
