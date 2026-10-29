"use client";

import { RotateCcw, X } from "lucide-react";
import { describeMergePath, threeWayMerge, type DataCardContent, type MergeChoice, type MergeResolutions } from "@/lib/data-card-merge";

export type DataCardMergeSession = {
  baseRevision: number;
  remoteRevision: number;
  base: DataCardContent;
  local: DataCardContent;
  remote: DataCardContent;
  baseAvailable: boolean;
};

export function DataCardMergeEditor({ session, resolutions, saving, error, indexLabel, onResolutionsChange, onCancel, onSave }: {
  session: DataCardMergeSession;
  resolutions: MergeResolutions;
  saving: boolean;
  error?: string;
  indexLabel?: string;
  onResolutionsChange: (value: MergeResolutions) => void;
  onCancel: () => void;
  onSave: (value: DataCardContent) => void;
}) {
  const result = threeWayMerge(session.base, session.local, session.remote, resolutions);
  const choose = (path: string, choice?: MergeChoice) => {
    const next = { ...resolutions };
    if (choice) next[path] = choice; else delete next[path];
    onResolutionsChange(next);
  };
  const chooseAll = (choice: Exclude<MergeChoice, "both">) => onResolutionsChange(Object.fromEntries(result.conflicts.map((conflict) => [conflict.path, choice])));
  return <div className="merge-editor-backdrop" role="dialog" aria-modal="true" aria-label="Revision 충돌 해결">
    <section className="merge-editor">
      <header className="merge-editor-header">
        <div><span className="merge-editor-eyebrow">REVISION CONFLICT</span><h2>{session.local.koreanName}{indexLabel ? ` · ${indexLabel}` : ""}</h2></div>
        <button onClick={onCancel} aria-label="충돌 해결 편집기 닫기"><X size={20}/></button>
        <dl><div><dt>Local Revision</dt><dd>{session.baseRevision}</dd></div><div><dt>Remote Revision</dt><dd>{session.remoteRevision}</dd></div><div><dt>충돌</dt><dd>{result.conflicts.length}</dd></div><div><dt>자동 병합</dt><dd>{result.automaticMerges}</dd></div></dl>
        {!session.baseAvailable ? <p className="merge-warning">정확한 Base snapshot을 서버에서 찾지 못해 브라우저에 보존된 Base를 사용합니다. 자동 병합 결과를 특히 주의해서 확인하세요.</p> : null}
      </header>
      <div className="merge-toolbar"><button onClick={() => chooseAll("local")}>내 변경사항 모두 선택</button><button onClick={() => chooseAll("remote")}>서버 변경사항 모두 선택</button><button onClick={() => onResolutionsChange({})}><RotateCcw size={14}/> 선택 초기화</button><span>{result.unresolved ? `${result.unresolved}개 선택 필요` : "모든 충돌 해결됨"}</span></div>
      <div className="merge-conflicts">
        {result.conflicts.length === 0 ? <div className="merge-empty">충돌하지 않는 변경사항은 모두 자동 병합되었습니다.</div> : result.conflicts.map((conflict) => <article className={`merge-conflict ${resolutions[conflict.path] ? "resolved" : ""}`} key={conflict.path}>
          <div className="merge-conflict-title"><strong>{describeMergePath(conflict.path)}</strong><span>{conflict.kind}</span></div>
          <div className="merge-compare">
            <button className={resolutions[conflict.path] === "local" ? "selected" : ""} onClick={() => choose(conflict.path, "local")}><b>내 변경사항</b><ValuePreview value={conflict.local}/></button>
            <button className={resolutions[conflict.path] === "remote" ? "selected" : ""} onClick={() => choose(conflict.path, "remote")}><b>서버 변경사항</b><ValuePreview value={conflict.remote}/></button>
          </div>
          <div className="merge-choice-row">{conflict.canKeepBoth ? <button className={resolutions[conflict.path] === "both" ? "selected" : ""} onClick={() => choose(conflict.path, "both")}>두 내용 모두 유지</button> : null}<button onClick={() => choose(conflict.path)}>이 항목 선택 초기화</button></div>
        </article>)}
      </div>
      <footer className="merge-preview">
        {error ? <p className="merge-error" role="alert">{error}</p> : null}
        <div><h3>최종 병합 결과 Preview</h3><p>{result.value.sections.length}개 Section · {countNodes(result.value.sections)}개 항목 · 저장 후 서버 콘텐츠를 다시 읽어 검증합니다.</p></div>
        <details><summary>병합 JSON 확인</summary><pre>{JSON.stringify(result.value, null, 2)}</pre></details>
        <div className="merge-footer-actions"><button onClick={onCancel}>편집기로 돌아가기</button><button className="primary" disabled={saving || result.unresolved > 0} onClick={() => onSave(result.value)}>{saving ? "저장 및 검증 중…" : "병합 결과 저장 및 검증"}</button></div>
      </footer>
    </section>
  </div>;
}

function ValuePreview({ value }: { value: unknown }) {
  if (value === undefined) return <span className="merge-deleted">삭제됨</span>;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <pre>{text || "(빈 값)"}</pre>;
}
function countNodes(sections: DataCardContent["sections"]) {
  const countItems = (items: { children?: typeof items }[]): number => items.reduce((sum, item) => sum + 1 + countItems(item.children ?? []), 0);
  return sections.reduce((sum, section) => sum + countItems(section.items) + (section.blocks ?? []).reduce((blockSum, block) => blockSum + (block.type === "items" ? countItems(block.items) : 1), 0), 0);
}
