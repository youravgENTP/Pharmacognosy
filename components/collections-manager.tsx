"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

type Drug = { id: string; koreanName: string };
type Collection = { id: string; name: string; description: string | null; members: Drug[] };

export function CollectionsManager({ drugs }: { drugs: Drug[] }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { const response = await fetch("/api/collections"); setCollections(await response.json()); setLoading(false); }
  useEffect(() => { void load(); }, []);
  async function create(event: React.FormEvent) { event.preventDefault(); if (!name.trim()) return; await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); setName(""); await load(); }
  async function rename(id: string, current: string) { const next = window.prompt("새 컬렉션 이름", current); if (!next?.trim()) return; await fetch(`/api/collections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) }); await load(); }
  async function remove(id: string) { if (!window.confirm("이 컬렉션을 삭제할까요? 생약 데이터는 삭제되지 않습니다.")) return; await fetch(`/api/collections/${id}`, { method: "DELETE" }); await load(); }
  async function addMember(collectionId: string, crudeDrugId: string) { if (!crudeDrugId) return; await fetch(`/api/collections/${collectionId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crudeDrugId }) }); await load(); }
  async function removeMember(collectionId: string, crudeDrugId: string) { await fetch(`/api/collections/${collectionId}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crudeDrugId }) }); await load(); }
  return <>
    <form className="form-row panel" onSubmit={create} style={{ marginBottom: 20 }}><input className="plain-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="새 컬렉션 이름 (예: 정유 함유 생약)"/><button className="button"><Plus size={15}/> 만들기</button></form>
    {loading ? <p className="muted">불러오는 중…</p> : collections.length ? <div className="collection-grid">{collections.map((collection) => {
      const available = drugs.filter((drug) => !collection.members.some((member) => member.id === drug.id));
      return <article className="panel" key={collection.id}><div className="collection-title"><button className="icon-button" style={{ fontSize: 18, color: "var(--ink)", fontWeight: 700 }} onClick={() => rename(collection.id, collection.name)}>{collection.name}</button><button className="icon-button" onClick={() => remove(collection.id)}><Trash2 size={16}/></button></div>
        <div className="chips">{collection.members.map((member) => <span className="chip" key={member.id}>{member.koreanName}<button className="icon-button" onClick={() => removeMember(collection.id, member.id)}><X size={12}/></button></span>)}</div>
        <select className="plain-input" style={{ marginTop: 16 }} value="" onChange={(event) => addMember(collection.id, event.target.value)}><option value="">+ 생약 추가</option>{available.map((drug) => <option key={drug.id} value={drug.id}>{drug.koreanName}</option>)}</select>
      </article>;
    })}</div> : <div className="empty">첫 컬렉션을 만들어 새로운 관점으로 생약을 묶어 보세요.</div>}
  </>;
}

