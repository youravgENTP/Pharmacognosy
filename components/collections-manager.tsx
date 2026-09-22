"use client";

import { FileText, Plus, Table2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Drug = { id: string; koreanName: string };
type Collection = { id: string; name: string; description: string | null; kind: "document" | "spreadsheet"; members: Drug[]; updatedAt: string; unresolved: boolean };

export function CollectionsManager({ drugs }: { drugs: Drug[] }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"document" | "spreadsheet">("document");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const nameInput = useRef<HTMLInputElement>(null);
  async function load() { const response = await fetch("/api/collections"); if (!response.ok) throw new Error(`컬렉션 목록을 불러오지 못했습니다. (${response.status})`); setCollections(await response.json()); setLoading(false); }
  useEffect(() => { void load().catch((error) => { setCreateError(error instanceof Error ? error.message : "컬렉션 목록을 불러오지 못했습니다."); setLoading(false); }); }, []);
  async function create(event: React.FormEvent) { event.preventDefault(); const trimmedName = name.trim(); if (!trimmedName) { setCreateError("컬렉션 이름을 입력해 주세요."); nameInput.current?.focus(); return; } setCreating(true); setCreateError(undefined); try { const response = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmedName, kind }) }); if (!response.ok) throw new Error(`컬렉션을 만들지 못했습니다. (${response.status})`); setName(""); await load(); } catch (error) { setCreateError(error instanceof Error ? error.message : "컬렉션을 만들지 못했습니다."); } finally { setCreating(false); } }
  async function rename(id: string, current: string) { const next = window.prompt("새 컬렉션 이름", current); if (!next?.trim()) return; await fetch(`/api/collections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) }); await load(); }
  async function remove(id: string) { if (!window.confirm("이 컬렉션을 삭제할까요? 생약 데이터는 삭제되지 않습니다.")) return; await fetch(`/api/collections/${id}`, { method: "DELETE" }); await load(); }
  async function addMember(collectionId: string, crudeDrugId: string) { if (!crudeDrugId) return; await fetch(`/api/collections/${collectionId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crudeDrugId }) }); await load(); }
  async function removeMember(collectionId: string, crudeDrugId: string) { await fetch(`/api/collections/${collectionId}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crudeDrugId }) }); await load(); }
  return <>
    <form className="panel collection-create-form" onSubmit={create} style={{ marginBottom: 20 }} aria-busy={creating}><div className="collection-kind-picker"><button type="button" className={kind === "document" ? "active" : ""} onClick={() => setKind("document")}><FileText/><span><b>Document</b><small>텍스트, 이미지, 리스트와 표를 자유롭게 조합합니다.</small></span></button><button type="button" className={kind === "spreadsheet" ? "active" : ""} onClick={() => setKind("spreadsheet")}><Table2/><span><b>Spreadsheet</b><small>하나의 큰 표에서 자료를 정리하고 Excel로 내보냅니다.</small></span></button></div><div className="form-row"><input ref={nameInput} className="plain-input" value={name} onChange={(event) => { setName(event.target.value); if (createError) setCreateError(undefined); }} placeholder="새 컬렉션 이름 (예: 정유 함유 생약)" aria-invalid={Boolean(createError)} aria-describedby={createError ? "collection-create-error" : undefined}/><button className="button" type="submit" disabled={creating}><Plus size={15}/> {creating ? "만드는 중…" : "만들기"}</button></div>{createError ? <p className="collection-create-error" id="collection-create-error" role="alert">{createError}</p> : null}</form>
    {loading ? <p className="muted">불러오는 중…</p> : collections.length ? <div className="collection-grid">{collections.map((collection) => {
      const available = drugs.filter((drug) => !collection.members.some((member) => member.id === drug.id));
      return <article className="panel collection-index-card" key={collection.id}><div className="collection-title"><Link href={`/collections/${collection.id}`} style={{ fontSize: 18, color: "var(--ink)", fontWeight: 700 }}>{collection.name}{collection.unresolved ? <b className="collection-conflict-badge">!</b> : null}</Link><span><button className="icon-button" onClick={() => rename(collection.id, collection.name)}>이름 변경</button><button className="icon-button" onClick={() => remove(collection.id)}><Trash2 size={16}/></button></span></div><small className="collection-type-badge">{collection.kind === "spreadsheet" ? <Table2 size={12}/> : <FileText size={12}/>} {collection.kind === "spreadsheet" ? "Spreadsheet" : "Document"}</small><small className="collection-updated">최근 수정 {new Date(collection.updatedAt).toLocaleString("ko-KR")}</small>
        <div className="chips">{collection.members.map((member) => <span className="chip" key={member.id}>{member.koreanName}<button className="icon-button" onClick={() => removeMember(collection.id, member.id)}><X size={12}/></button></span>)}</div>
        <select className="plain-input" style={{ marginTop: 16 }} value="" onChange={(event) => addMember(collection.id, event.target.value)}><option value="">+ 기존 그룹 멤버 추가</option>{available.map((drug) => <option key={drug.id} value={drug.id}>{drug.koreanName}</option>)}</select><Link className="button collection-open" href={`/collections/${collection.id}`}>{collection.kind === "spreadsheet" ? "스프레드시트 열기" : "문서 열기"}</Link>
      </article>;
    })}</div> : <div className="empty">첫 컬렉션을 만들어 새로운 관점으로 생약을 묶어 보세요.</div>}
  </>;
}
