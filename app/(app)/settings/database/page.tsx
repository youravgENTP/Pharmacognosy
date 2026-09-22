import { Download } from "lucide-react";
import Link from "next/link";
import { ImportWorkspace } from "@/components/import-workspace";
import { StorageDashboard } from "@/components/storage-dashboard";
import { BackupSettings } from "@/components/backup-settings";
import { requireUser } from "@/lib/auth/current-user";

export default async function DatabaseSettingsPage() {
  const current = await requireUser();
  return <div className="database-settings">
    {current.role === "admin" ? <BackupSettings/> : <section className="settings-section panel"><h2>Backup & Restore</h2><p className="muted">전체 백업과 복원은 관리자만 사용할 수 있습니다.</p></section>}
    <section className="settings-section" id="import"><div className="settings-section-heading"><h2>Import</h2><p>외부 HerbOverflow Import Schema v1 데이터를 검증한 뒤 안전하게 병합합니다. 백업 복원과는 별개의 기능입니다.</p></div><ImportWorkspace/></section>
    <section className="settings-section panel" id="storage"><h2>Storage</h2><StorageDashboard/></section>
    <section className="settings-section panel" id="maintenance"><h2>Maintenance</h2><p className="muted">사용되지 않는 이미지 정리는 위 Storage에서 실행할 수 있습니다.</p><p className="muted">기존 호환용 내보내기는 categories, families, drugs만 포함하며 전체 백업이 아닙니다.</p><Link className="button secondary" href="/api/export" prefetch={false}><Download size={15}/> Legacy JSON Data Export</Link></section>
  </div>;
}
