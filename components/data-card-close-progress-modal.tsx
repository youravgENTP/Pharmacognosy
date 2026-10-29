"use client";

import { AlertTriangle, GitMerge, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { DataCardCloseState } from "@/components/data-card-save-guard";

export const closeProgressCopy: Record<Exclude<DataCardCloseState, "idle" | "dirty">, { title: string; description: string }> = {
  saving: { title: "변경사항 저장 중", description: "마지막 수정사항을 서버에 반영하고 있습니다." },
  verifying: { title: "저장 확인 중", description: "모든 변경사항이 정상적으로 저장되었는지 확인하고 있습니다." },
  closing: { title: "안전하게 닫는 중", description: "저장이 확인되었습니다. 데이터카드를 닫고 있습니다." },
  failed: { title: "저장을 완료하지 못했습니다", description: "입력 내용은 그대로 유지되어 있습니다." },
  conflict: { title: "저장 충돌이 발생했습니다", description: "서버에 다른 변경사항이 저장되어 있습니다." },
};

export function DataCardCloseProgressModal({ state, error, onRetry, onReturn, onResolveConflict }: {
  state: Exclude<DataCardCloseState, "idle" | "dirty">;
  error?: string;
  onRetry: () => void;
  onReturn: () => void;
  onResolveConflict: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.focus(); }, [state]);
  if (typeof document === "undefined") return null;
  const copy = closeProgressCopy[state];
  const busy = state === "saving" || state === "verifying" || state === "closing";
  return createPortal(<div className="data-card-progress-backdrop" onMouseDown={(event) => event.preventDefault()}>
    <div ref={dialog} className={`data-card-progress-modal ${state}`} role="dialog" aria-modal="true" aria-live="polite" aria-labelledby="data-card-progress-title" aria-describedby="data-card-progress-description" tabIndex={-1} onKeyDown={(event) => trapProgressDialog(event, dialog.current)}>
      <div className="data-card-progress-icon" aria-hidden="true">{busy ? state === "closing" ? <ShieldCheck size={24}/> : <LoaderCircle className="progress-spinner" size={24}/> : state === "conflict" ? <GitMerge size={24}/> : <AlertTriangle size={24}/>}</div>
      <h2 id="data-card-progress-title">{copy.title}</h2>
      <p id="data-card-progress-description">{error && !busy ? error : copy.description}</p>
      {state === "failed" ? <div className="data-card-progress-actions"><button onClick={onReturn}>편집으로 돌아가기</button><button className="primary" onClick={onRetry}>다시 시도</button></div> : null}
      {state === "conflict" ? <div className="data-card-progress-actions"><button onClick={onReturn}>편집으로 돌아가기</button><button className="primary" onClick={onResolveConflict}>충돌 해결</button></div> : null}
    </div>
  </div>, document.body);
}

function trapProgressDialog(event: React.KeyboardEvent, dialog: HTMLDivElement | null) {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); return; }
  if (event.key !== "Tab" || !dialog) return;
  const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) { event.preventDefault(); return; }
  const first = focusable[0]!; const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
