"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { X } from "lucide-react";

export function ProfileModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handler); };
  });
  return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="profile-modal-card"><button className="modal-close" onClick={close} aria-label="닫기"><X size={21}/></button><div className="profile-modal-body">{children}</div></div></div>;
}
