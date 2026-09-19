import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="page settings-page"><header className="page-header"><div><h1>Settings</h1><p className="subtitle">앱 동작, Fields, 화면 표시와 데이터를 관리합니다.</p></div></header><div className="settings-layout"><SettingsNav/><main className="settings-content">{children}</main></div></div>;
}
