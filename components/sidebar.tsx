"use client";

import { ChevronsLeft, ChevronsRight, Download, Flower2, Layers3, Leaf, LogOut, PanelsTopLeft, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import { useEffect, useState } from "react";
import type { CurrentUser } from "@/lib/auth/current-user";
import { authClient } from "@/lib/auth-client";

const links = [
  { href: "/", label: "Herb Garden", icon: Leaf },
  { href: "/constituents", label: "Compound Tree", icon: TaxonomyIcon },
  { href: "/families", label: "Families", icon: Flower2 },
  { href: "/collections", label: "Collections", icon: Layers3 },
  { href: "/cards", label: "Word Cards", icon: PanelsTopLeft },
  { href: "/export", label: "Export", icon: Download },
  { href: "/settings", label: "Settings", icon: Settings },
];

function TaxonomyIcon({ size = 19, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><rect x="4" y="3" width="16" height="4" rx="1.5"/><path d="M12 7v4M7 11h10M7 11v3M17 11v3"/><rect x="3.5" y="14" width="7" height="4" rx="1.3"/><rect x="13.5" y="14" width="7" height="4" rx="1.3"/><path d="M7 18v3M4.5 21h5"/></svg>;
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(localStorage.getItem("sidebar-collapsed") === "true"), []);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: next }));
  }
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/login");
  }
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="brand">
  <Link href="/" className="brand-home" aria-label="Herb Overflow 홈">
    <Image
      src="/HerbOverflow.png"
      alt=""
      width={34}
      height={34}
      className="brand-logo"
    />
    <span className="brand-text">
      <span>Herb</span>
      <span>Overflow</span>
    </span>
  </Link>

  <button
    className="collapse-button"
    onClick={toggle}
    title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
  >
    {collapsed
      ? <ChevronsRight size={20}/>
      : <ChevronsLeft size={20}/>}
  </button>
</div>
    <nav className="nav">{links.map(({ href, label, icon: Icon }) => {
      const active = href === "/" ? pathname === "/" || pathname.startsWith("/drugs/") : pathname.startsWith(href);
      return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} title={collapsed ? label : undefined}><Icon size={19}/><span>{label}</span></Link>;
    })}</nav>
    <div className="sidebar-account">
      <div className="sidebar-avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}</div>
      <div className="sidebar-user-copy"><strong>{user.name}</strong><span>{user.role === "admin" ? "Admin" : "Editor"}</span></div>
      <div className="sidebar-user-actions">
        <Link href="/settings/account" title="Account" aria-label="Account"><UserRound size={17}/></Link>
        <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17}/></button>
      </div>
    </div>
  </aside>;
}
