"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";
import { DataCardSaveGuardProvider, useDataCardSaveGuard } from "@/components/data-card-save-guard";

export function ProfileModal({ children }: { children: React.ReactNode }) {
  return <DataCardSaveGuardProvider><ProfileModalFrame>{children}</ProfileModalFrame></DataCardSaveGuardProvider>;
}

function ProfileModalFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { blocked, state, requestClose } = useDataCardSaveGuard();
  const close = () => { void requestClose(() => router.back()); };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handler); };
  // close delegates to a stable guard; router is retained for the final action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestClose, router]);
  const closing = state === "saving" || state === "verifying" || state === "closing";
  return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="profile-modal-card"><button className="modal-close" onClick={close} disabled={closing} title={blocked ? "최신 변경사항을 저장·검증한 뒤 닫습니다." : undefined} aria-label="닫기"><X size={21}/></button><div className="profile-modal-body">{children}</div></div></div>;
}
