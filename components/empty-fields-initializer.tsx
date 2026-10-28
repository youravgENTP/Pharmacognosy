"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Result = {
  readiness: { migrationState: "ready" | "migration-missing" | "journal-missing" | "schema-missing"; backupReady: boolean; lastSuccessfulBackupAt: string | null; requiredBackupAt: string | null };
  preview: {
    canExecute: boolean;
    errors: string[];
    summary: { requested: number; initialize: number; excludedExisting: number; changedSinceBackup: number; conflicts: number };
    initialize: { id: string; koreanName: string; categoryName: string; fields: string[] }[];
    excluded: { id: string; koreanName: string; reason: string }[];
    conflicts: { id: string; koreanName: string; reason: string }[];
  };
};

export function EmptyFieldsInitializer() {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string>();
  const [plan, setPlan] = useState<unknown>();
  const [result, setResult] = useState<Result>();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"preview" | "execute">();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function loadFile(file?: File) {
    if (!file) return;
    setFilename(file.name); setText(await file.text()); setPlan(undefined); setResult(undefined); setConfirmed(false); setError(undefined); setMessage(undefined);
  }
  async function preview() {
    setPending("preview"); setError(undefined); setMessage(undefined); setConfirmed(false);
    try {
      const parsed = JSON.parse(text);
      const response = await fetch("/api/initialize-empty-fields/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "조사에 실패했습니다.");
      setPlan(parsed); setResult(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "계획 JSON을 읽을 수 없습니다."); }
    finally { setPending(undefined); }
  }
  async function execute() {
    if (!plan || !result?.preview.canExecute || !result.readiness.backupReady || !confirmed) return;
    setPending("execute"); setError(undefined);
    try {
      const response = await fetch("/api/initialize-empty-fields/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan, confirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "초기화에 실패했습니다.");
      setMessage(`${body.initialized}개 Data Card에 계획된 기본 필드 7개를 추가했습니다.${body.conflicts.length ? ` ${body.conflicts.length}개는 실행 직전 변경되어 건너뛰었습니다.` : ""}`);
      setResult(undefined); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "초기화에 실패했습니다."); }
    finally { setPending(undefined); }
  }
  const readinessMessage = result?.readiness.migrationState !== "ready" ? "Migration Journal과 실제 DB schema가 일치해야 합니다." : !result.readiness.backupReady ? "계획 원본 이후 생성·검증된 최근 ZIP Backup이 필요합니다." : null;
  return <section className="settings-section empty-fields-initializer" id="initialize-empty-fields">
    <div className="settings-section-heading"><h2>Initialize Empty Fields</h2><p>안전 유지보수 계획의 153 UUID만 조사하며, sections가 정확히 빈 배열인 활성 생약에 계획된 7개 필드만 추가합니다.</p></div>
    <div className="panel">
      <div className="collection-title"><div><h3>Field Initialization Plan</h3><p className="muted">Reindex와 독립적으로 Preview하고 실행합니다. 기존 Section은 하나라도 있으면 제외합니다.</p></div><label className="button secondary"><Upload size={15}/> {filename ?? "계획 JSON 선택"}<input type="file" accept="application/json,.json" hidden onChange={(event) => void loadFile(event.target.files?.[0])}/></label></div>
      <textarea className="code-input" value={text} onChange={(event) => { setText(event.target.value); setPlan(undefined); setResult(undefined); setConfirmed(false); }} placeholder="herboverflow.safe-maintenance-plan JSON" spellCheck={false}/>
      <div className="empty-fields-actions"><button className="button secondary" disabled={!text || Boolean(pending)} onClick={() => void preview()}><RefreshCw size={15}/> {pending === "preview" ? "조사 중…" : "빈 필드 Preview"}</button>{result?.readiness.lastSuccessfulBackupAt ? <small>마지막 성공 Backup · {new Date(result.readiness.lastSuccessfulBackupAt).toLocaleString("ko-KR")}</small> : <small>성공한 Backup 기록 없음</small>}</div>
      {readinessMessage ? <p className="archive-notice error"><AlertTriangle size={15}/> {readinessMessage} <Link href="#backup">Backup으로 이동</Link></p> : null}
      {error ? <pre className="form-error" style={{ whiteSpace: "pre-wrap" }}>{error}</pre> : null}{message ? <p className="form-success"><CheckCircle2 size={15}/> {message}</p> : null}
      {result ? <><div className="empty-fields-summary"><span>계획 대상<strong>{result.preview.summary.requested}</strong></span><span>초기화 예정<strong>{result.preview.summary.initialize}</strong></span><span>기존 Section 제외<strong>{result.preview.summary.excludedExisting}</strong></span><span>백업 이후 변경<strong>{result.preview.summary.changedSinceBackup}</strong></span><span>차단 충돌<strong>{result.preview.summary.conflicts}</strong></span></div>
        <div className="empty-fields-list">{result.preview.initialize.map((drug) => <article key={drug.id}><header><strong>{drug.koreanName}</strong><small>{drug.categoryName}</small></header><p>{drug.fields.join(" · ")}</p></article>)}</div>
        {result.preview.excluded.length || result.preview.conflicts.length ? <details className="empty-fields-review"><summary>제외 및 충돌 목록</summary>{[...result.preview.excluded, ...result.preview.conflicts].map((drug) => <p key={drug.id}><strong>{drug.koreanName}</strong> · {drug.reason}</p>)}</details> : null}
        {result.preview.errors.length ? <pre className="form-error" style={{ whiteSpace: "pre-wrap" }}>{result.preview.errors.join("\n")}</pre> : <label className="reindex-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>기존 Section을 덮어쓰지 않고 빈 카드에 지정된 7개 필드만 추가함을 확인했습니다.</span></label>}
        <button className="button" disabled={!confirmed || !result.preview.canExecute || !result.readiness.backupReady || !result.preview.initialize.length || Boolean(pending)} onClick={() => void execute()}>{pending === "execute" ? "초기화 중…" : "확인 후 빈 필드 초기화"}</button></> : <div className="empty">계획 JSON을 선택한 뒤 빈 필드 Preview를 실행하세요.</div>}
    </div>
  </section>;
}
