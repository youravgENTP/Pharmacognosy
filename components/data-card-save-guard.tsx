"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DataCardCloseProgressModal } from "@/components/data-card-close-progress-modal";

export type DataCardCloseState = "idle" | "dirty" | "saving" | "verifying" | "closing" | "failed" | "conflict";
export type DataCardCloseController = { closeAndVerify: () => Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }>; reopenAfterFailedBatch?: () => void; openConflictResolver?: () => void };
type SaveGuard = { blocked: boolean; state: DataCardCloseState; error?: string; closePending: boolean; isClosePending: () => boolean; setBlocked: (blocked: boolean) => void; setState: (state: DataCardCloseState, error?: string) => void; registerCloseController: (key: string, controller: DataCardCloseController | null) => void; requestClose: (afterClose: () => void) => Promise<boolean>; suspendProgress: () => void; cancelPendingClose: () => void; resumePendingClose: () => Promise<boolean> };
const DataCardSaveGuardContext = createContext<SaveGuard>({ blocked: false, state: "idle", closePending: false, isClosePending: () => false, setBlocked: () => undefined, setState: () => undefined, registerCloseController: () => undefined, requestClose: async (afterClose) => { afterClose(); return true; }, suspendProgress: () => undefined, cancelPendingClose: () => undefined, resumePendingClose: async () => false });

export function DataCardSaveGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false); const [state, setCloseState] = useState<DataCardCloseState>("idle"); const [error, setError] = useState<string>();
  const [progressVisible, setProgressVisible] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const closePendingRef = useRef(false);
  const controllers = useRef(new Map<string, DataCardCloseController>()); const closing = useRef<Promise<boolean> | null>(null); const pendingCloseAction = useRef<(() => void) | null>(null); const failedController = useRef<DataCardCloseController | null>(null);
  const registerCloseController = useCallback((key: string, next: DataCardCloseController | null) => { if (next) controllers.current.set(key, next); else controllers.current.delete(key); }, []);
  const setState = useCallback((next: DataCardCloseState, message?: string) => { setCloseState(next); setError(message); }, []);
  const requestClose = useCallback(async (afterClose: () => void) => {
    if (!controllers.current.size) { afterClose(); return true; }
    setProgressVisible(true);
    if (closing.current) return closing.current;
    pendingCloseAction.current = afterClose;
    closePendingRef.current = true;
    setClosePending(true);
    const pending = (async () => {
      const completed: DataCardCloseController[] = [];
      for (const controller of [...controllers.current.values()]) {
        const result = await controller.closeAndVerify();
        if (!result.ok) { completed.forEach((item) => item.reopenAfterFailedBatch?.()); failedController.current = controller; setCloseState(result.conflict ? "conflict" : "failed"); setError(result.error); return false; }
        completed.push(controller);
      }
      failedController.current = null; pendingCloseAction.current = null; closePendingRef.current = false; setClosePending(false); controllers.current.clear(); afterClose(); return true;
    })().catch((caught) => { setCloseState("failed"); setError(caught instanceof Error ? caught.message : "종료 전 저장 검증에 실패했습니다."); return false; }).finally(() => { closing.current = null; });
    closing.current = pending; return pending;
  }, []);
  const suspendProgress = useCallback(() => setProgressVisible(false), []);
  const returnToEditing = useCallback(() => { setProgressVisible(false); closePendingRef.current = false; setClosePending(false); pendingCloseAction.current = null; failedController.current = null; }, []);
  const resumePendingClose = useCallback(async () => { const action = pendingCloseAction.current; return action ? requestClose(action) : false; }, [requestClose]);
  const resolveConflict = useCallback(() => { setProgressVisible(false); failedController.current?.openConflictResolver?.(); }, []);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!controllers.current.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.download || anchor.origin !== window.location.origin) return;
      event.preventDefault(); void requestClose(() => router.push(`${anchor.pathname}${anchor.search}${anchor.hash}`));
    };
    const popState = () => { if (!controllers.current.size) return; window.history.forward(); void requestClose(() => window.history.back()); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (controllers.current.size) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("click", click, true); window.addEventListener("popstate", popState); window.addEventListener("beforeunload", beforeUnload);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("popstate", popState); window.removeEventListener("beforeunload", beforeUnload); };
  }, [requestClose, router]);
  const isClosePending = useCallback(() => closePendingRef.current, []);
  const value = useMemo(() => ({ blocked, state, error, closePending, isClosePending, setBlocked, setState, registerCloseController, requestClose, suspendProgress, cancelPendingClose: returnToEditing, resumePendingClose }), [blocked, closePending, error, isClosePending, registerCloseController, requestClose, resumePendingClose, returnToEditing, setState, state, suspendProgress]);
  const modalState = state === "idle" || state === "dirty" ? null : state;
  return <DataCardSaveGuardContext.Provider value={value}>{children}{progressVisible && modalState ? <DataCardCloseProgressModal state={modalState} error={error} onRetry={() => void resumePendingClose()} onReturn={returnToEditing} onResolveConflict={resolveConflict}/> : null}</DataCardSaveGuardContext.Provider>;
}

export function useDataCardSaveGuard() { return useContext(DataCardSaveGuardContext); }
