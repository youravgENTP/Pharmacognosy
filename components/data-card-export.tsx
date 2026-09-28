"use client";

import { Check, Download, FileText, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDrugIndex } from "@/lib/drug-index";
import { sortExportDrugs, type ExportSortMode as SortMode } from "@/lib/export/drug-order";

type Importance = "중요" | "중간" | "비중요";
type Drug = { id: string; catalogIndex: number | null; referenceIndex: number | null; koreanName: string; latinName: string | null; importance: Importance; categoryId: string | null; categoryName: string | null; categoryPosition: number | null };
type MnemonicMode = "preferred" | "mine" | "none" | "all";
type ExportPhase = "idle" | "preparing" | "generating" | "downloading" | "complete";
type TransferProgress = { percent: number; received: number; total: number };

export function DataCardExport({ drugs, initialDrugId }: { drugs: Drug[]; initialDrugId?: string }) {
  const validInitial = initialDrugId && drugs.some((drug) => drug.id === initialDrugId) ? initialDrugId : undefined;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(validInitial ? [validInitial] : []));
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("index");
  const [columns, setColumns] = useState<1 | 2>(2);
  const [mnemonicMode, setMnemonicMode] = useState<MnemonicMode>("preferred");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ExportPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [transfer, setTransfer] = useState<TransferProgress>();
  const exportLock = useRef(false);
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

  useEffect(() => {
    if (!busy) { setElapsedSeconds(0); return; }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function add(ids: string[]) { setSelected((current) => new Set([...current, ...ids])); }
  async function exportCards() {
    const drugIds = sorted.filter((drug) => selected.has(drug.id)).map((drug) => drug.id);
    if (!drugIds.length || exportLock.current) return;
    exportLock.current = true;
    setBusy(true); setPhase("preparing"); setActiveCount(drugIds.length); setTransfer(undefined); setError(undefined);
    try {
      await nextPaint();
      setPhase("generating");
      const response = await fetch("/api/export/drugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drugIds, format: "docx", columns, mnemonicMode }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(typeof body.error === "string" ? body.error : "파일을 생성하지 못했습니다."); }
      setPhase("downloading");
      const blob = await responseBlob(response, setTransfer);
      if (!blob.size) throw new Error("생성된 파일이 비어 있습니다.");
      const expectedType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (blob.type !== expectedType) throw new Error("DOCX 응답 형식이 올바르지 않습니다.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "HerbOverflow-DataCards.docx"; anchor.style.display = "none";
      document.body.appendChild(anchor); anchor.click();
      window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 30_000);
      setTransfer({ percent: 100, received: blob.size, total: blob.size });
      setPhase("complete");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "파일을 생성하지 못했습니다."); }
    finally { exportLock.current = false; setBusy(false); setPhase("idle"); }
  }

  const percent = overallProgress(phase, elapsedSeconds, transfer?.percent);
  const detail = progressDetail(phase, activeCount, transfer);

  return <div className="data-export-layout">
    <section className="panel data-export-picker">
      <div className="data-export-summary"><div><strong>{selected.size}</strong><span>개 Data Card 선택됨</span></div><button onClick={() => setSelected(new Set())} disabled={!selected.size}><X size={14}/> 선택 지우기</button></div>
      <div className="data-export-quick"><button onClick={() => setSelected(new Set(drugs.map((drug) => drug.id)))}>전체 생약</button>{categories.map((category) => <button key={category.id} onClick={() => add(category.drugIds)}>{category.name}<small>{category.drugIds.length}</small></button>)}</div>
      <div className="data-export-list-tools"><div className="search-wrap"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="생약명, Latin name, 인덱스 검색"/></div><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="정렬"><option value="index">Index order</option><option value="name">Korean name order</option><option value="importance">Importance order</option></select></div>
      <div className="data-export-drugs">{visible.map((drug) => <label key={drug.id} className={selected.has(drug.id) ? "selected" : ""}><input type="checkbox" checked={selected.has(drug.id)} onChange={() => toggle(drug.id)}/><span className="data-export-check">{selected.has(drug.id) ? <Check size={13}/> : null}</span><b>{formatDrugIndex(drug.catalogIndex, drug.referenceIndex)}</b><span><strong>{drug.koreanName}</strong><small>{[drug.latinName, drug.categoryName].filter(Boolean).join(" · ")}</small></span><em className={`importance-${importanceClass(drug.importance)}`}>{drug.importance}</em></label>)}</div>
    </section>
    <aside className="panel data-export-options"><header><FileText size={20}/><div><h2>Data Card Export</h2><p>채워진 필드를 현재 순서대로 Word 문서로 내보냅니다.</p></div></header><div className="data-export-format"><span>파일 형식</span><strong>Word DOCX</strong><small>.docx 문서</small></div><label>레이아웃<select value={columns} onChange={(event) => setColumns(Number(event.target.value) as 1 | 2)}><option value={1}>1 column</option><option value={2}>2 columns</option></select></label><label>암기법<select value={mnemonicMode} onChange={(event) => setMnemonicMode(event.target.value as MnemonicMode)}><option value="preferred">Preferred/default mnemonic</option><option value="mine">My mnemonic</option><option value="none">No mnemonic</option><option value="all">All mnemonic versions</option></select></label>{error ? <p className="data-export-error" role="alert">{error}</p> : null}{busy ? <div className="data-export-progress" role="status" aria-live="polite"><div className="data-export-progress-heading"><span><strong>{progressTitle(phase)}</strong><small>{detail}</small></span><b>{percent}%</b></div><div className="data-export-progress-track" role="progressbar" aria-label="DOCX 내보내기 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${progressTitle(phase)} ${percent}%`}><i style={{ width: `${percent}%` }}/></div><div className="data-export-progress-meta"><span>{activeCount}개 Data Card</span><span>{elapsedSeconds}초 경과</span>{transfer?.total ? <span>{formatBytes(transfer.received)} / {formatBytes(transfer.total)}</span> : <span>{phase === "generating" ? "예상 진행률" : "처리 중"}</span>}</div><ol className="data-export-progress-steps">{progressSteps.map((step, index) => { const state = stepState(phase, index); return <li key={step} className={state}>{state === "done" ? <Check size={12}/> : state === "active" ? <LoaderCircle size={12}/> : <span>{index + 1}</span>}<b>{step}</b></li>; })}</ol></div> : null}<button className="data-export-submit" disabled={!selected.size || busy} onClick={() => void exportCards()}><Download size={16}/>{busy ? progressButtonLabel(phase) : `${selected.size}개 DOCX 내보내기`}</button>{!selected.size ? <small>먼저 하나 이상의 Data Card를 선택하세요.</small> : null}</aside>
  </div>;
}

function importanceClass(value: Importance) { return { 중요: "important", 중간: "medium", 비중요: "low" }[value]; }

const progressSteps = ["요청 확인", "DOCX 생성", "파일 전송", "다운로드 준비"];

function progressTitle(phase: ExportPhase) { return { idle: "대기 중", preparing: "내보내기 준비 중", generating: "DOCX 문서 생성 중", downloading: "생성된 파일 받는 중", complete: "다운로드 준비 완료" }[phase]; }
function progressButtonLabel(phase: ExportPhase) { return phase === "downloading" ? "파일 받는 중…" : phase === "complete" ? "다운로드 완료" : "DOCX 생성 중…"; }
function progressDetail(phase: ExportPhase, count: number, transfer?: TransferProgress) {
  if (phase === "preparing") return `${count}개 항목과 내보내기 설정을 확인하고 있습니다.`;
  if (phase === "generating") return "Data Card 내용과 이미지를 불러와 Word 문서를 조립하고 있습니다.";
  if (phase === "downloading") return transfer?.total ? `생성된 DOCX ${formatBytes(transfer.total)}를 브라우저로 전송하고 있습니다.` : "생성된 DOCX를 브라우저로 전송하고 있습니다.";
  if (phase === "complete") return "파일 다운로드가 시작되었습니다.";
  return "";
}
function overallProgress(phase: ExportPhase, elapsedSeconds: number, transferPercent = 0) {
  if (phase === "preparing") return 5;
  if (phase === "generating") return Math.min(82, 14 + Math.round(68 * (1 - Math.exp(-elapsedSeconds / 14))));
  if (phase === "downloading") return Math.min(99, 84 + Math.round(transferPercent * .15));
  if (phase === "complete") return 100;
  return 0;
}
function stepState(phase: ExportPhase, index: number) {
  const current = { idle: -1, preparing: 0, generating: 1, downloading: 2, complete: 4 }[phase];
  return index < current ? "done" : index === current ? "active" : "pending";
}
function formatBytes(value: number) { return value < 1024 ** 2 ? `${Math.max(.1, value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }
function nextPaint() { return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())); }

async function responseBlob(response: Response, onProgress: (value: TransferProgress) => void) {
  const total = Number(response.headers.get("Content-Length"));
  if (!response.body || !Number.isFinite(total) || total <= 0) return response.blob();
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer);
    received += value.byteLength;
    onProgress({ percent: Math.min(100, Math.round(received / total * 100)), received, total });
  }
  return new Blob(chunks, { type: response.headers.get("Content-Type") ?? "application/octet-stream" });
}
