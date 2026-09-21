"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import type { CurrentUser } from "@/lib/auth/current-user";

export function Shell({ children, user }: { children: React.ReactNode; user: CurrentUser }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
    const colors = localStorage.getItem("importance-colors");
    if (colors) { const keys = ["important", "medium", "low"]; (JSON.parse(colors) as string[]).slice(0, keys.length).forEach((color, index) => document.documentElement.style.setProperty(`--importance-${keys[index]}`, color)); }
    const listener = (event: Event) => setCollapsed((event as CustomEvent<boolean>).detail);
    window.addEventListener("sidebar-toggle", listener);
    return () => window.removeEventListener("sidebar-toggle", listener);
  }, []);
  return <div className="shell"><Sidebar user={user}/><main className={`content ${collapsed ? "sidebar-collapsed" : ""}`}>{children}</main></div>;
}
