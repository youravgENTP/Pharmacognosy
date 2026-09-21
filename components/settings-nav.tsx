"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [["/settings/account", "Account"], ["/settings/general", "General"], ["/settings/fields", "Fields"], ["/settings/shortcuts", "LaTeX"], ["/settings/appearance", "Appearance"], ["/settings/database", "Database"]] as const;
export function SettingsNav({ isAdmin }: { isAdmin: boolean }) { const pathname = usePathname(); return <nav className="settings-nav">{links.map(([href, label]) => <Link className={pathname === href ? "active" : ""} href={href} key={href}>{label}</Link>)}{isAdmin && <Link className={pathname === "/settings/users" ? "active" : ""} href="/settings/users">Users</Link>}</nav>; }
