"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type DataCardCloseState = "idle" | "dirty" | "saving" | "verifying" | "closing" | "failed" | "conflict";
export type DataCardCloseController = { closeAndVerify: () => Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }>; reopenAfterFailedBatch?: () => void };
type SaveGuard = { blocked: boolean; state: DataCardCloseState; error?: string; setBlocked: (blocked: boolean) => void; setState: (state: DataCardCloseState, error?: string) => void; registerCloseController: (key: string, controller: DataCardCloseController | null) => void; requestClose: (afterClose: () => void) => Promise<boolean> };
const DataCardSaveGuardContext = createContext<SaveGuard>({ blocked: false, state: "idle", setBlocked: () => undefined, setState: () => undefined, registerCloseController: () => undefined, requestClose: async (afterClose) => { afterClose(); return true; } });

export function DataCardSaveGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false); const [state, setCloseState] = useState<DataCardCloseState>("idle"); const [error, setError] = useState<string>();
  const controllers = useRef(new Map<string, DataCardCloseController>()); const closing = useRef<Promise<boolean> | null>(null);
  const registerCloseController = useCallback((key: string, next: DataCardCloseController | null) => { if (next) controllers.current.set(key, next); else controllers.current.delete(key); }, []);
  const setState = useCallback((next: DataCardCloseState, message?: string) => { setCloseState(next); setError(message); }, []);
  const requestClose = useCallback(async (afterClose: () => void) => {
    if (!controllers.current.size) { afterClose(); return true; }
    if (closing.current) return closing.current;
    const pending = (async () => {
      const completed: DataCardCloseController[] = [];
      for (const controller of [...controllers.current.values()]) {
        const result = await controller.closeAndVerify();
        if (!result.ok) { completed.forEach((item) => item.reopenAfterFailedBatch?.()); setCloseState(result.conflict ? "conflict" : "failed"); setError(result.error); return false; }
        completed.push(controller);
      }
      controllers.current.clear(); afterClose(); return true;
    })().catch((caught) => { setCloseState("failed"); setError(caught instanceof Error ? caught.message : "종료 전 저장 검증에 실패했습니다."); return false; }).finally(() => { closing.current = null; });
    closing.current = pending; return pending;
  }, []);
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
  const value = useMemo(() => ({ blocked, state, error, setBlocked, setState, registerCloseController, requestClose }), [blocked, error, registerCloseController, requestClose, setState, state]);
  return <DataCardSaveGuardContext.Provider value={value}>{children}</DataCardSaveGuardContext.Provider>;
}

export function useDataCardSaveGuard() { return useContext(DataCardSaveGuardContext); }
