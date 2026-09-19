import { Download } from "lucide-react";
import Link from "next/link";
import { ImportWorkspace } from "@/components/import-workspace";
import { StorageDashboard } from "@/components/storage-dashboard";

export default function DatabaseSettingsPage() { return <div className="database-settings"><section className="settings-section panel" id="storage"><h2>Storage</h2><StorageDashboard/></section><section className="settings-section" id="import"><div className="settings-section-heading"><h2>Import</h2><p>JSON 데이터를 검증한 뒤 안전하게 병합합니다.</p></div><ImportWorkspace/></section><section className="settings-section panel" id="export"><h2>Export</h2><p className="muted">현재 생약과 Family 데이터를 JSON 백업으로 내려받습니다.</p><Link className="button" href="/api/export" prefetch={false}><Download size={15}/> JSON 내보내기</Link></section><section className="settings-section panel" id="maintenance"><h2>Maintenance</h2><p className="muted">사용되지 않는 이미지 정리는 위 Storage의 Unused images에서 실행할 수 있습니다.</p></section></div>; }
