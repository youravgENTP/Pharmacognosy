"use client";

import { CheckCircle2, FileJson, Upload } from "lucide-react";
import { useState } from "react";
import { importExample } from "@/lib/import-schema";

type ImportIssue = { code: string; message: string };
type PreviewDrug = { koreanName: string; category: string; exists: boolean; fieldsAdded: string[]; fieldsUpdated: string[]; fieldsPreserved: string[]; familyAction: string; relationshipAction: string; mnemonicAction: string; identityAction: string; correctionCount: number; corrections: { original: string; normalized: string; reason: string }[]; warnings: ImportIssue[]; errors: ImportIssue[] };
type Preview = { valid: true; canCommit: boolean; summary: { total: number; new: number; existing: number; errors: number; warnings: number }; drugs: PreviewDrug[] };

export function ImportWorkspace() {
  const [text, setText] = useState(JSON.stringify(importExample, null, 2));
  const [payload, setPayload] = useState<unknown>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [strategy, setStrategy] = useState<"merge" | "skip">("merge");
  const [result, setResult] = useState<string>();
  const [filename, setFilename] = useState<string>();
  const [pending, setPending] = useState<"validate" | "commit">();
  async function validate() {
    setError(undefined); setResult(undefined); setPreview(undefined); setPending("validate");
    try {
      const parsed = JSON.parse(text);
      const response = await fetch("/api/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.errors?.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join("\n") || "검증에 실패했습니다.");
      setPayload(parsed); setPreview(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "JSON을 읽을 수 없습니다."); }
    finally { setPending(undefined); }
  }
  async function commit() {
    setPending("commit"); setError(undefined);
    try {
      const response = await fetch("/api/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, existingStrategy: strategy }) });
      const body = await response.json();
      if (!response.ok) { setError(typeof body.error === "string" ? body.error : "가져오기에 실패했습니다."); return; }
      setResult(`완료: ${body.inserted}개 추가, ${body.updated}개 업데이트, ${body.skipped}개 건너뜀 · 관계 ${body.relationshipsUpserted}개 · 암기법 ${body.mnemonicsUpserted}개`); setPreview(undefined);
    } catch { setError("서버에 연결하지 못해 가져오기에 실패했습니다."); }
    finally { setPending(undefined); }
  }
  async function loadFile(file?: File) { if (file) { setFilename(file.name); setText(await file.text()); setPreview(undefined); setPayload(undefined); setError(undefined); setResult(undefined); } }
  return <div className="editor-grid">
    <section className="panel"><div className="collection-title"><div><h2 style={{ marginBottom: 5 }}>Herb Overflow Import Schema v1</h2><p className="muted" style={{ marginBottom: 0 }}>생약 기본 정보와 계층형 학습 항목용 JSON입니다. 이미지·컬렉션·Compound Tree·전체 백업 ZIP은 이 가져오기 대상이 아닙니다.</p></div><label className="button secondary"><Upload size={15}/> {filename ?? "JSON 파일 선택"}<input type="file" accept="application/json,.json" hidden onChange={(event) => void loadFile(event.target.files?.[0])}/></label></div>
      <textarea className="code-input" value={text} onChange={(event) => { setText(event.target.value); setPreview(undefined); }} spellCheck={false}/>
      {error ? <pre style={{ color: "#a13931", whiteSpace: "pre-wrap" }}>{error}</pre> : null}
      {result ? <p style={{ color: "var(--green)" }}><CheckCircle2 size={16}/> {result}</p> : null}
      <button className="button" disabled={Boolean(pending)} onClick={() => void validate()}><FileJson size={15}/> {pending === "validate" ? "검증 중…" : "검증하고 미리보기"}</button>
    </section>
    <aside className="side-card"><div className="panel"><h3>안전한 2단계 가져오기</h3><p className="muted">검증 → 필드별 변경 확인 → 명시적 커밋 순서로 진행됩니다.</p>
      {preview ? <><p><strong>{preview.summary.total}</strong>개 중 새 항목 {preview.summary.new}개, 기존 항목 {preview.summary.existing}개 · 오류 {preview.summary.errors} · 경고 {preview.summary.warnings}</p><div className="preview-list import-preview-list">{preview.drugs.map((drug) => <div className={`preview-row import-preview-row ${drug.errors.length ? "has-errors" : ""}`} key={drug.koreanName}><header><span><strong>{drug.koreanName}</strong><small className="muted"> · {drug.category}</small></span><span className={`badge ${drug.exists ? "" : "new"}`}>{drug.exists ? "기존" : "신규"}</span></header><dl><div><dt>필드 추가</dt><dd>{drug.fieldsAdded.join(", ") || "없음"}</dd></div><div><dt>필드 업데이트</dt><dd>{drug.fieldsUpdated.join(", ") || "없음"}</dd></div><div><dt>필드 유지</dt><dd>{drug.fieldsPreserved.join(", ") || "없음"}</dd></div><div><dt>Family</dt><dd>{drug.familyAction}</dd></div><div><dt>관계</dt><dd>{drug.relationshipAction}</dd></div><div><dt>암기법</dt><dd>{drug.mnemonicAction}</dd></div><div><dt>식별</dt><dd>{drug.identityAction}</dd></div><div><dt>교정</dt><dd>{drug.correctionCount}개</dd></div></dl>{drug.corrections.map((correction, index) => <p className="import-correction" key={`${correction.original}-${index}`}>{correction.original} → {correction.normalized}</p>)}{drug.warnings.map((issue) => <p className="import-warning" key={`${issue.code}-${issue.message}`}>경고 · {issue.message}</p>)}{drug.errors.map((issue) => <p className="import-blocking" key={`${issue.code}-${issue.message}`}>오류 · {issue.message}</p>)}</div>)}</div>
        {preview.summary.existing ? <div className="field" style={{ marginTop: 15 }}><label>기존 생약 처리</label><select value={strategy} onChange={(event) => setStrategy(event.target.value as "merge" | "skip")}><option value="merge">병합 / 업데이트</option><option value="skip">건너뛰기</option></select></div> : null}
        {!preview.canCommit ? <p className="form-error">차단 오류를 수정한 뒤 JSON을 다시 검증하세요.</p> : null}<button className="button" disabled={Boolean(pending) || !preview.canCommit} style={{ width: "100%", marginTop: 14 }} onClick={() => void commit()}>{pending === "commit" ? "가져오는 중…" : "확인 후 가져오기"}</button></> : <div className="empty" style={{ padding: 25 }}>검증 결과가 여기에 표시됩니다.</div>}
    </div></aside>
  </div>;
}
