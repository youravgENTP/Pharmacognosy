"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
    const colors = localStorage.getItem("importance-colors");
    if (colors) { const keys = ["important", "medium", "low", "related"]; (JSON.parse(colors) as string[]).forEach((color, index) => document.documentElement.style.setProperty(`--importance-${keys[index]}`, color)); }
    const listener = (event: Event) => setCollapsed((event as CustomEvent<boolean>).detail);
    window.addEventListener("sidebar-toggle", listener);
    return () => window.removeEventListener("sidebar-toggle", listener);
  }, []);
  return <div className="shell"><Sidebar/><main className={`content ${collapsed ? "sidebar-collapsed" : ""}`}>{children}</main></div>;
}
