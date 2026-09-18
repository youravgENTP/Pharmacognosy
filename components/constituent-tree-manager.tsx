"use client";

import { ChevronDown, ChevronRight, Link2, Pencil, Plus, Search, Trash2, Unlink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type NodeKind = "pathway" | "class" | "subclass" | "compound";
type Taxon = { id: string; name: string; kind: NodeKind; description: string | null };
type Edge = { parentId: string; childId: string };
const labels: Record<NodeKind, string> = { pathway: "생합성 경로", class: "성분군", subclass: "하위 성분군", compound: "개별 성분" };

export function ConstituentTreeManager() {
  const [nodes, setNodes] = useState<Taxon[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NodeKind>("class");
  const [parentId, setParentId] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  async function load() { const response = await fetch("/api/constituent-taxa"); const data = await response.json(); setNodes(data.nodes); setEdges(data.edges); setExpanded(new Set(data.nodes.filter((node: Taxon) => node.kind === "pathway").map((node: Taxon) => node.id))); }
  useEffect(() => { void load(); }, []);
  const roots = useMemo(() => nodes.filter((node) => !edges.some((edge) => edge.childId === node.id)), [nodes, edges]);
  const selectedNode = nodes.find((node) => node.id === selected);
  async function create(event: React.FormEvent) { event.preventDefault(); if (!name.trim()) return; await fetch("/api/constituent-taxa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind, parentId: parentId || undefined }) }); setName(""); await load(); }
  async function rename(node: Taxon) { const next = window.prompt("새 이름", node.name); if (!next?.trim()) return; await fetch(`/api/constituent-taxa/${node.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) }); await load(); }
  async function remove(node: Taxon) { if (!window.confirm(`“${node.name}”을 삭제할까요? 하위 연결은 해제되지만 하위 항목 자체는 남습니다.`)) return; await fetch(`/api/constituent-taxa/${node.id}`, { method: "DELETE" }); if (selected === node.id) setSelected(undefined); await load(); }
  async function addParent(newParentId: string) { if (!selected || !newParentId) return; const response = await fetch(`/api/constituent-taxa/${selected}/parents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: newParentId }) }); if (!response.ok) window.alert((await response.json()).error); await load(); }
  async function unlink(parent: string) { if (!selected) return; await fetch(`/api/constituent-taxa/${selected}/parents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: parent }) }); await load(); }
  const matched = query.trim() ? nodes.filter((node) => node.name.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <div className="taxonomy-layout">
    <section className="panel taxonomy-main"><div className="search-wrap taxonomy-search"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="경로, 성분군, 개별 성분 검색"/></div>
      <div className="taxonomy-tree">{query.trim() ? matched.map((node) => <TaxonRow key={node.id} node={node} depth={0} selected={selected} setSelected={setSelected}/>) : roots.map((node) => <TreeBranch key={node.id} node={node} nodes={nodes} edges={edges} depth={0} path={new Set()} selected={selected} setSelected={setSelected} expanded={expanded} setExpanded={setExpanded}/>)}</div>
    </section>
    <aside className="taxonomy-side">
      <form className="panel" onSubmit={create}><h3>새 항목</h3><div className="field"><label>이름</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: Monoterpenoid"/></div><div className="field"><label>종류</label><select value={kind} onChange={(event) => setKind(event.target.value as NodeKind)}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="field"><label>상위 항목</label><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">최상위</option>{nodes.map((node) => <option value={node.id} key={node.id}>{node.name}</option>)}</select></div><button className="button" style={{ width: "100%" }}><Plus size={15}/> 추가</button></form>
      {selectedNode ? <div className="panel"><span className={`taxon-kind ${selectedNode.kind}`}>{labels[selectedNode.kind]}</span><h2 className="taxon-detail-name">{selectedNode.name}</h2><div className="form-row"><button className="button secondary" onClick={() => rename(selectedNode)}><Pencil size={14}/> 이름 변경</button><button className="button danger" onClick={() => remove(selectedNode)}><Trash2 size={14}/></button></div><hr className="separator"/><h3>상위 분류</h3>{edges.filter((edge) => edge.childId === selectedNode.id).map((edge) => <div className="parent-link" key={edge.parentId}><span>{nodes.find((node) => node.id === edge.parentId)?.name}</span><button className="icon-button" onClick={() => unlink(edge.parentId)} title="연결 해제"><Unlink size={14}/></button></div>)}<select className="plain-input" value="" onChange={(event) => addParent(event.target.value)}><option value="">+ 다른 상위 분류 연결</option>{nodes.filter((node) => node.id !== selectedNode.id && !edges.some((edge) => edge.childId === selectedNode.id && edge.parentId === node.id)).map((node) => <option value={node.id} key={node.id}>{node.name}</option>)}</select><p className="muted taxonomy-help"><Link2 size={13}/> 하나의 성분군을 여러 생합성 경로에 연결할 수 있습니다.</p></div> : <div className="panel muted">트리에서 항목을 선택하면 수정 및 다중분류 옵션이 표시됩니다.</div>}
    </aside>
  </div>;
}

function TreeBranch({ node, nodes, edges, depth, path, selected, setSelected, expanded, setExpanded }: { node: Taxon; nodes: Taxon[]; edges: Edge[]; depth: number; path: Set<string>; selected?: string; setSelected: (id: string) => void; expanded: Set<string>; setExpanded: (value: Set<string>) => void }) {
  if (path.has(node.id)) return null;
  const children = edges.filter((edge) => edge.parentId === node.id).map((edge) => nodes.find((item) => item.id === edge.childId)).filter(Boolean) as Taxon[];
  const open = expanded.has(node.id);
  const nextPath = new Set(path).add(node.id);
  return <div><div className={`taxon-row ${selected === node.id ? "selected" : ""}`} style={{ paddingLeft: 8 + depth * 22 }}><button className="taxon-toggle" onClick={() => { const next = new Set(expanded); if (open) next.delete(node.id); else next.add(node.id); setExpanded(next); }}>{children.length ? (open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>) : <span/>}</button><button className="taxon-label" onClick={() => setSelected(node.id)}><span>{node.name}</span><small>{labels[node.kind]}</small></button></div>{open ? children.map((child) => <TreeBranch key={`${node.id}-${child.id}`} node={child} nodes={nodes} edges={edges} depth={depth + 1} path={nextPath} selected={selected} setSelected={setSelected} expanded={expanded} setExpanded={setExpanded}/>) : null}</div>;
}

function TaxonRow({ node, depth, selected, setSelected }: { node: Taxon; depth: number; selected?: string; setSelected: (id: string) => void }) { return <div className={`taxon-row ${selected === node.id ? "selected" : ""}`} style={{ paddingLeft: 8 + depth * 22 }}><span className="taxon-toggle"/><button className="taxon-label" onClick={() => setSelected(node.id)}><span>{node.name}</span><small>{labels[node.kind]}</small></button></div>; }
