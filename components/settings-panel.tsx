"use client";
import { useEffect, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { applyTheme, isThemeMode, type ThemeMode } from "@/lib/theme";

const defaults = ["#9fc5ff", "#d9e7fb", "#edf0f4"];
const labels = ["중요", "중간", "비중요"];
const keys = ["important", "medium", "low"];
export function SettingsPanel() {
  const [colors, setColors] = useState(defaults);
  const [theme, setTheme] = useState<ThemeMode>("night");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const activeTheme = document.documentElement.dataset.theme ?? null;
    if (isThemeMode(activeTheme)) setTheme(activeTheme);
    const stored = localStorage.getItem("importance-colors");
    if (stored) { const parsed = JSON.parse(stored) as string[]; setColors(parsed); parsed.forEach((color, index) => document.documentElement.style.setProperty(`--importance-${keys[index]}`, color)); }
  }, []);
  function selectTheme(next: ThemeMode) { setTheme(next); applyTheme(next); }
  function save() { localStorage.setItem("importance-colors", JSON.stringify(colors)); colors.forEach((color, index) => document.documentElement.style.setProperty(`--importance-${keys[index]}`, color)); setSaved(true); window.setTimeout(() => setSaved(false), 1500); }
  return <div className="settings-stack" style={{ maxWidth: 650 }}>
    <section className="panel theme-settings"><h2>Theme</h2><p className="muted">이 브라우저에서 사용할 화면 테마를 선택합니다.</p><div className="theme-options">
      <button type="button" className={theme === "day" ? "active" : ""} aria-pressed={theme === "day"} onClick={() => selectTheme("day")}><Sun size={20}/><span><strong>Day Mode</strong><small>Light Soft Sage document theme</small></span>{theme === "day" ? <Check size={17}/> : null}</button>
      <button type="button" className={theme === "night" ? "active" : ""} aria-pressed={theme === "night"} onClick={() => selectTheme("night")}><Moon size={20}/><span><strong>Night Mode</strong><small>Current dark navy theme</small></span>{theme === "night" ? <Check size={17}/> : null}</button>
    </div></section>
    <section className="panel"><h2>중요도 색상</h2><p className="muted">개인 표시 설정의 기반입니다. 현재 브라우저에 저장됩니다.</p><div className="basic-grid">{colors.map((color, index) => <div className="field" key={index}><label>{labels[index]}</label><div className="form-row"><input type="color" value={color} onChange={(event) => setColors(colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><input value={color} onChange={(event) => setColors(colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/></div></div>)}</div><button className="button" onClick={save} style={{ marginTop: 18 }}>{saved ? "저장됨" : "표시 설정 저장"}</button></section>
  </div>;
}
