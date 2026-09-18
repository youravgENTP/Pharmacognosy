"use client";

import { BookOpen, ChevronsLeft, ChevronsRight, Database, Flower2, FolderHeart, Hexagon, Import, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Herb Garden", icon: Database },
  { href: "/constituents", label: "Compount Tree", icon: Hexagon },
  { href: "/families", label: "Families", icon: Flower2 },
  { href: "/collections", label: "Collections", icon: FolderHeart },
  { href: "/cards", label: "Word Cards", icon: BookOpen },
  { href: "/import", label: "Import", icon: Import },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(localStorage.getItem("sidebar-collapsed") === "true"), []);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: next }));
  }
  return <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
    <div className="brand"><span className="brand-mark">P</span><span className="brand-text">Pharmaco</span><button className="collapse-button" onClick={toggle} title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}>{collapsed ? <ChevronsRight size={20}/> : <ChevronsLeft size={20}/>}</button></div>
    <nav className="nav">{links.map(({ href, label, icon: Icon }) => {
      const active = href === "/" ? pathname === "/" || pathname.startsWith("/drugs/") : pathname.startsWith(href);
      return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} title={collapsed ? label : undefined}><Icon size={19}/><span>{label}</span></Link>;
    })}</nav>
  </aside>;
}
