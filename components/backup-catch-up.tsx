"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { downloadFullBackup } from "@/lib/backup/client";
import { catchUpAttemptKey } from "@/lib/backup/policy";

type PolicyResponse = { policy: { enabled: boolean; catchUp: boolean }; schedule: { overdue: boolean; periodKey: string | null } };

export function BackupCatchUp({ admin }: { admin: boolean }) {
  const running = useRef(false);
  const [warning, setWarning] = useState(false);
  const check = useCallback(async () => {
    if (!admin || running.current || document.visibilityState === "hidden") return;
    const response = await fetch("/api/backup/policy", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as PolicyResponse;
    if (!data.policy.enabled || !data.policy.catchUp || !data.schedule.overdue || !data.schedule.periodKey) { setWarning(false); return; }
    const lockKey = catchUpAttemptKey(data.schedule.periodKey);
    if (sessionStorage.getItem(lockKey)) { setWarning(true); return; }
    sessionStorage.setItem(lockKey, "started");
    running.current = true;
    setWarning(true);
    try {
      const attempt = await fetch("/api/backup/policy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attempt", periodKey: data.schedule.periodKey }) });
      if (!attempt.ok) throw new Error(attempt.status === 409 ? "This backup period was already attempted." : "Could not register backup attempt.");
      await downloadFullBackup();
      const success = await fetch("/api/backup/policy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "success", periodKey: data.schedule.periodKey }) });
      if (!success.ok) throw new Error("Could not record local backup delivery.");
      sessionStorage.setItem(lockKey, "initiated");
      setWarning(false);
    } catch (error) {
      console.error("Automatic local backup catch-up failed", error);
      sessionStorage.setItem(lockKey, "failed");
      setWarning(true);
    } finally { running.current = false; }
  }, [admin]);
  useEffect(() => {
    void check();
    const focus = () => void check();
    const visibility = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [check]);
  if (!warning) return null;
  return <div className="backup-overdue-banner"><span><strong>Backup overdue</strong>예정된 로컬 백업이 아직 저장되지 않았습니다.</span><Link href="/settings/database#backup">지금 백업</Link></div>;
}
