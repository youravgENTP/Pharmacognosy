"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Plan = {
  canExecute: boolean;
  summary: { requested: number; changed: number; unchanged: number; errors: number };
  items: { id: string | null; koreanName: string; currentIndex: number | null; targetIndex: number; changed: boolean; errors: string[] }[];
  errors: string[];
  mode?: "safe-maintenance";
  readiness?: { migrationState: "ready" | "migration-missing" | "journal-missing" | "schema-missing"; backupReady: boolean; lastSuccessfulBackupAt: string | null };
};

const example = { schema: "pharmacognosy.import", version: 1, drugs: [{ koreanName: "진피", catalogIndex: 1 }] };

export function ReindexManager() {
  const [text, setText] = useState(JSON.stringify(example, null, 2));
  const [payload, setPayload] = useState<unknown>();
  const [plan, setPlan] = useState<Plan>();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"preview" | "execute">();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [filename, setFilename] = useState<string>();

  async function preview() {
    setPending("preview"); setError(undefined); setMessage(undefined); setPlan(undefined); setConfirmed(false);
    try {
      const parsed = JSON.parse(text);
      const response = await fetch("/api/reindex/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Reindex Preview에 실패했습니다.");
      setPayload(parsed); setPlan(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "JSON을 읽을 수 없습니다."); }
    finally { setPending(undefined); }
  }

  async function execute() {
    if (!payload || !plan?.canExecute || plan.readiness && !plan.readiness.backupReady || !confirmed) return;
    setPending("execute"); setError(undefined);
    try {
      const response = await fetch("/api/reindex/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, confirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Reindex 실행에 실패했습니다.");
      setMessage(`${body.changed}개 생약의 catalogIndex를 변경했습니다. 다른 데이터는 변경하지 않았습니다.`); setPlan(undefined); setConfirmed(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reindex 실행에 실패했습니다."); }
    finally { setPending(undefined); }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    setFilename(file.name); setText(await file.text()); setPayload(undefined); setPlan(undefined); setConfirmed(false); setError(undefined); setMessage(undefined);
  }

  const readinessBlocked = plan?.mode === "safe-maintenance" && (!plan.readiness?.backupReady || plan.readiness.migrationState !== "ready");
  return <section className="settings-section reindex-manager" id="reindex"><div className="settings-section-heading"><h2>Reindex</h2><p>안전 계획에서는 UUID·예상 현재 번호·목표 번호를 모두 검증하고 catalogIndex만 트랜잭션으로 변경합니다.</p></div>
    <div className="editor-grid"><section className="panel"><div className="collection-title"><div><h3>Index Plan JSON</h3><p className="muted">Sections, Mnemonics, 관계, 중요도와 기타 필드는 무시됩니다.</p></div><label className="button secondary"><Upload size={15}/> {filename ?? "JSON 파일 선택"}<input type="file" accept="application/json,.json" hidden onChange={(event) => void loadFile(event.target.files?.[0])}/></label></div><textarea className="code-input" value={text} onChange={(event) => { setText(event.target.value); setPlan(undefined); setConfirmed(false); }} spellCheck={false}/><button className="button" disabled={Boolean(pending)} onClick={() => void preview()}><RefreshCw size={15}/> {pending === "preview" ? "검증 중…" : "Preview 만들기"}</button>{error ? <pre className="form-error" style={{ whiteSpace: "pre-wrap" }}>{error}</pre> : null}{message ? <p className="form-success"><CheckCircle2 size={15}/> {message}</p> : null}</section>
      <aside className="side-card"><div className="panel"><h3>Reindex Preview</h3>{plan ? <><p><strong>{plan.summary.requested}</strong>개 요청 · 변경 {plan.summary.changed} · 유지 {plan.summary.unchanged} · 오류 {plan.summary.errors}</p>{readinessBlocked ? <p className="archive-notice error"><AlertTriangle size={15}/> Migration과 검증된 Backup이 준비되어야 실행할 수 있습니다. <Link href="#backup">Backup</Link></p> : null}<div className="preview-list reindex-preview-list">{plan.items.map((item, index) => <div className={`preview-row ${item.errors.length ? "has-errors" : ""}`} key={`${item.koreanName}-${index}`}><header><strong>{item.koreanName}</strong><b>{item.currentIndex ?? "—"} → {item.targetIndex}</b></header>{item.errors.map((value) => <p className="import-blocking" key={value}>오류 · {value}</p>)}</div>)}</div>{plan.errors.length ? <p className="form-error">충돌을 수정하고 다시 Preview하세요.</p> : <label className="reindex-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>Preview의 변경 번호만 적용함을 확인했습니다.</span></label>}<button className="button" style={{ width: "100%", marginTop: 12 }} disabled={!plan.canExecute || readinessBlocked || !confirmed || Boolean(pending)} onClick={() => void execute()}>{pending === "execute" ? "변경 중…" : "확인 후 Reindex 실행"}</button></> : <div className="empty" style={{ padding: 25 }}>Preview에서 기존 번호 → 변경 번호와 모든 차단 오류를 확인할 수 있습니다.</div>}</div></aside>
    </div>
  </section>;
}
