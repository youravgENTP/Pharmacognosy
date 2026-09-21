import { SettingsNav } from "@/components/settings-nav";
import { requireUser } from "@/lib/auth/current-user";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="page settings-page"><header className="page-header"><div><h1>Settings</h1><p className="subtitle">앱 동작, Fields, 화면 표시와 데이터를 관리합니다.</p></div></header><div className="settings-layout"><SettingsNav isAdmin={user.role === "admin"}/><main className="settings-content">{children}</main></div></div>;
}
