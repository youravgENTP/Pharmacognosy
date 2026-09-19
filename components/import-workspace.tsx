"use client";

import { CheckCircle2, FileJson, Upload } from "lucide-react";
import { useState } from "react";
import { importExample } from "@/lib/import-schema";

type Preview = { valid: true; summary: { total: number; new: number; existing: number }; drugs: { koreanName: string; category: string; exists: boolean }[] };

export function ImportWorkspace() {
  const [text, setText] = useState(JSON.stringify(importExample, null, 2));
  const [payload, setPayload] = useState<unknown>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [strategy, setStrategy] = useState<"merge" | "skip">("merge");
  const [result, setResult] = useState<string>();
  async function validate() {
    setError(undefined); setResult(undefined); setPreview(undefined);
    try {
      const parsed = JSON.parse(text);
      const response = await fetch("/api/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.errors?.map((issue: { path: (string | number)[]; message: string }) => `${issue.path.join(".")}: ${issue.message}`).join("\n") || "검증에 실패했습니다.");
      setPayload(parsed); setPreview(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "JSON을 읽을 수 없습니다."); }
  }
  async function commit() {
    const response = await fetch("/api/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, existingStrategy: strategy }) });
    const body = await response.json();
    if (!response.ok) { setError("가져오기에 실패했습니다."); return; }
    setResult(`완료: ${body.inserted}개 추가, ${body.updated}개 업데이트, ${body.skipped}개 건너뜀`); setPreview(undefined);
  }
  async function loadFile(file?: File) { if (file) { setText(await file.text()); setPreview(undefined); } }
  return <div className="editor-grid">
    <section className="panel"><div className="collection-title"><div><h2 style={{ marginBottom: 5 }}>Herb Overflow Import Schema v1</h2><p className="muted" style={{ marginBottom: 0 }}>JSON을 붙여넣거나 파일을 선택하세요. 검증 전에는 DB에 기록하지 않습니다.</p></div><label className="button secondary"><Upload size={15}/> 파일 선택<input type="file" accept="application/json,.json" hidden onChange={(event) => loadFile(event.target.files?.[0])}/></label></div>
      <textarea className="code-input" value={text} onChange={(event) => { setText(event.target.value); setPreview(undefined); }} spellCheck={false}/>
      {error ? <pre style={{ color: "#a13931", whiteSpace: "pre-wrap" }}>{error}</pre> : null}
      {result ? <p style={{ color: "var(--green)" }}><CheckCircle2 size={16}/> {result}</p> : null}
      <button className="button" onClick={validate}><FileJson size={15}/> 검증하고 미리보기</button>
    </section>
    <aside className="side-card"><div className="panel"><h3>안전한 2단계 가져오기</h3><p className="muted">검증 → 기존 항목 확인 → 명시적 확인 순서로 진행됩니다.</p>
      {preview ? <><p><strong>{preview.summary.total}</strong>개 중 새 항목 {preview.summary.new}개, 기존 항목 {preview.summary.existing}개</p><div className="preview-list">{preview.drugs.map((drug) => <div className="preview-row" key={drug.koreanName}><span>{drug.koreanName}<small className="muted"> · {drug.category}</small></span><span className={`badge ${drug.exists ? "" : "new"}`}>{drug.exists ? "기존" : "신규"}</span></div>)}</div>
        {preview.summary.existing ? <div className="field" style={{ marginTop: 15 }}><label>기존 생약 처리</label><select value={strategy} onChange={(event) => setStrategy(event.target.value as "merge" | "skip")}><option value="merge">병합 / 업데이트</option><option value="skip">건너뛰기</option></select></div> : null}
        <button className="button" style={{ width: "100%", marginTop: 14 }} onClick={commit}>확인 후 가져오기</button></> : <div className="empty" style={{ padding: 25 }}>검증 결과가 여기에 표시됩니다.</div>}
    </div></aside>
  </div>;
}
