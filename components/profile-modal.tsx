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
  const { blocked } = useDataCardSaveGuard();
  const close = () => { if (!blocked) router.back(); };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape" && !blocked) router.back(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handler); };
  }, [blocked, router]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="profile-modal-card"><button className="modal-close" onClick={close} disabled={blocked} title={blocked ? "저장이 완료되면 닫을 수 있습니다." : undefined} aria-label="닫기"><X size={21}/></button><div className="profile-modal-body">{children}</div></div></div>;
}
