"use client";
import { useEffect, useState } from "react";

const defaults = ["#9fc5ff", "#d9e7fb", "#edf0f4", "#e3d9f7"];
const labels = ["중요", "중간", "비중요", "연관"];
const keys = ["important", "medium", "low", "related"];
export function SettingsPanel() {
  const [colors, setColors] = useState(defaults);
  const [saved, setSaved] = useState(false);
  useEffect(() => { const stored = localStorage.getItem("importance-colors"); if (stored) { const parsed = JSON.parse(stored) as string[]; setColors(parsed); parsed.forEach((color, index) => document.documentElement.style.setProperty(`--importance-${keys[index]}`, color)); } }, []);
  function save() { localStorage.setItem("importance-colors", JSON.stringify(colors)); colors.forEach((color, index) => document.documentElement.style.setProperty(`--importance-${keys[index]}`, color)); setSaved(true); window.setTimeout(() => setSaved(false), 1500); }
  return <div className="panel" style={{ maxWidth: 650 }}><h2>중요도 색상</h2><p className="muted">개인 표시 설정의 기반입니다. 현재 브라우저에 저장됩니다.</p><div className="basic-grid">{colors.map((color, index) => <div className="field" key={index}><label>{labels[index]}</label><div className="form-row"><input type="color" value={color} onChange={(event) => setColors(colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><input value={color} onChange={(event) => setColors(colors.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/></div></div>)}</div><button className="button" onClick={save} style={{ marginTop: 18 }}>{saved ? "저장됨" : "표시 설정 저장"}</button></div>;
}
