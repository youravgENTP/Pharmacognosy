"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LatexShortcut } from "@/lib/latex-shortcuts";

export function LatexShortcutsSettings() {
  const [rows, setRows] = useState<LatexShortcut[]>([]); const [command, setCommand] = useState(""); const [replacement, setReplacement] = useState(""); const [error, setError] = useState<string>();
  useEffect(() => { fetch("/api/settings/latex-shortcuts").then((response) => response.json()).then(setRows).catch(() => setError("단축어를 불러오지 못했습니다.")); }, []);
  function notify() { window.dispatchEvent(new Event("latex-shortcuts-updated")); }
  async function create() {
    const response = await fetch("/api/settings/latex-shortcuts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, replacement }) }); const body = await response.json();
    if (!response.ok) { setError(body.error ?? "추가하지 못했습니다."); return; }
    setRows((current) => [...current, body]); setCommand(""); setReplacement(""); setError(undefined); notify();
  }
  async function save(row: LatexShortcut) {
    const response = await fetch(`/api/settings/latex-shortcuts/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: row.command, replacement: row.replacement }) }); const body = await response.json();
    if (!response.ok) { setError(body.error ?? "저장하지 못했습니다."); return; }
    setRows((current) => current.map((item) => item.id === row.id ? body : item)); setError(undefined); notify();
  }
  async function remove(row: LatexShortcut) {
    if (!window.confirm(`\\${row.command} 단축어를 삭제할까요?`)) return;
    const response = await fetch(`/api/settings/latex-shortcuts/${row.id}`, { method: "DELETE" }); if (!response.ok) { setError("삭제하지 못했습니다."); return; }
    setRows((current) => current.filter((item) => item.id !== row.id)); setError(undefined); notify();
  }
  function patch(id: string, value: Partial<LatexShortcut>) { setRows((current) => current.map((item) => item.id === id ? { ...item, ...value } : item)); }
  return <section className="settings-section panel"><h2>LaTeX Shortcuts</h2><p className="muted"><code>\</code> 또는 <code>₩</code> 뒤에 명령어를 입력하면 설정된 기호로 변환됩니다. 공백·Enter 또는 포커스 이동 시 적용됩니다.</p>{error ? <p className="image-upload-error">{error}</p> : null}<div className="shortcut-table"><div className="shortcut-head"><span>명령어</span><span>변환 결과</span><span/></div>{rows.map((row) => <div className="shortcut-row" key={row.id}><label><span>\</span><input value={row.command} onChange={(event) => patch(row.id, { command: event.target.value.replace(/^[\\₩]+/, "") })}/></label><input value={row.replacement} onChange={(event) => patch(row.id, { replacement: event.target.value })}/><span><button onClick={() => void save(row)} title="저장"><Save size={15}/></button><button onClick={() => void remove(row)} title="삭제"><Trash2 size={15}/></button></span></div>)}</div><div className="shortcut-new"><Plus size={16}/><label><span>\</span><input value={command} onChange={(event) => setCommand(event.target.value.replace(/^[\\₩]+/, ""))} placeholder="command"/></label><input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="변환 결과"/><button onClick={() => void create()} disabled={!command.trim() || !replacement}>추가</button></div></section>;
}
