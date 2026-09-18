"use client";

import { Check, ChevronDown, ChevronRight, Link2, MoreHorizontal, Pencil, Plus, Search, Trash2, Unlink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type NodeKind = "pathway" | "class" | "subclass";
type Taxon = { id: string; name: string; kind: NodeKind; description: string | null };
type Edge = { parentId: string; childId: string };
type Constituent = { id: string; name: string; aliases: string[] };
type InlineEditor = { type: "add"; parentId: string | null } | { type: "edit"; nodeId: string } | null;
const labels: Record<NodeKind, string> = { pathway: "생합성 경로", class: "성분군", subclass: "하위 성분군" };

export function ConstituentTreeManager() {
  const [nodes, setNodes] = useState<Taxon[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<InlineEditor>(null);
  const [manageId, setManageId] = useState<string>();

  async function load(preferredSelection?: string) {
    const response = await fetch("/api/constituent-taxa");
    const data = await response.json() as { nodes: Taxon[]; edges: Edge[] };
    setNodes(data.nodes ?? []);
    setEdges(data.edges ?? []);
    setExpanded((current) => current.size ? current : new Set(data.nodes.filter((node) => node.kind === "pathway").map((node) => node.id)));
    setSelected((current) => preferredSelection ?? current ?? data.nodes.find((node) => node.kind === "pathway")?.id);
  }
  useEffect(() => { void load(); }, []);

  const roots = useMemo(() => nodes.filter((node) => !edges.some((edge) => edge.childId === node.id && nodes.some((candidate) => candidate.id === edge.parentId))), [nodes, edges]);
  const selectedNode = nodes.find((node) => node.id === selected);
  const matched = query.trim() ? nodes.filter((node) => node.name.toLowerCase().includes(query.trim().toLowerCase())) : [];

  async function create(name: string, kind: NodeKind, parentId: string | null) {
    const response = await fetch("/api/constituent-taxa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind, parentId: parentId || undefined }) });
    if (!response.ok) { window.alert("항목을 추가하지 못했습니다."); return; }
    const created = await response.json() as Taxon;
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    setEditor(null);
    await load(created.id);
  }
  async function update(node: Taxon, name: string, kind: NodeKind) {
    const response = await fetch(`/api/constituent-taxa/${node.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind }) });
    if (!response.ok) { window.alert("항목을 수정하지 못했습니다."); return; }
    setEditor(null);
    await load(node.id);
  }
  async function remove(node: Taxon) {
    if (!window.confirm(`“${node.name}”을 삭제할까요? 하위 연결은 해제되지만 하위 항목 자체는 남습니다.`)) return;
    await fetch(`/api/constituent-taxa/${node.id}`, { method: "DELETE" });
    setManageId(undefined);
    if (selected === node.id) setSelected(undefined);
    await load();
  }
  async function addParent(nodeId: string, parentId: string) {
    if (!parentId) return;
    const response = await fetch(`/api/constituent-taxa/${nodeId}/parents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId }) });
    if (!response.ok) { window.alert((await response.json()).error); return; }
    setExpanded((current) => new Set(current).add(parentId));
    await load(nodeId);
  }
  async function unlink(nodeId: string, parentId: string) {
    await fetch(`/api/constituent-taxa/${nodeId}/parents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId }) });
    await load(nodeId);
  }
  const actions = { setSelected, setEditor, setManageId, remove, addParent, unlink };

  return <div className="taxonomy-layout explorer-layout">
    <section className="panel taxonomy-main">
      <div className="taxonomy-toolbar"><div className="search-wrap taxonomy-search"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="경로, 성분군 검색"/></div><button className="taxonomy-root-add" onClick={() => setEditor({ type: "add", parentId: null })}><Plus size={15}/> 최상위 항목</button></div>
      {editor?.type === "add" && editor.parentId === null ? <InlineTaxonForm mode="add" onSubmit={(name, kind) => create(name, kind, null)} onCancel={() => setEditor(null)}/> : null}
      <div className="taxonomy-tree">{query.trim() ? matched.map((node) => <FlatTaxonRow key={node.id} node={node} selected={selected} setSelected={setSelected}/>) : roots.map((node) => <TreeBranch key={node.id} node={node} nodes={nodes} edges={edges} depth={0} path={new Set()} selected={selected} expanded={expanded} setExpanded={setExpanded} editor={editor} manageId={manageId} actions={actions} onCreate={create} onUpdate={update}/>)}</div>
    </section>
    <ConstituentExplorer node={selectedNode}/>
  </div>;
}

type TreeActions = { setSelected: (id: string) => void; setEditor: (value: InlineEditor) => void; setManageId: (id: string | undefined) => void; remove: (node: Taxon) => Promise<void>; addParent: (nodeId: string, parentId: string) => Promise<void>; unlink: (nodeId: string, parentId: string) => Promise<void> };

function TreeBranch({ node, nodes, edges, depth, path, selected, expanded, setExpanded, editor, manageId, actions, onCreate, onUpdate }: { node: Taxon; nodes: Taxon[]; edges: Edge[]; depth: number; path: Set<string>; selected?: string; expanded: Set<string>; setExpanded: (value: Set<string>) => void; editor: InlineEditor; manageId?: string; actions: TreeActions; onCreate: (name: string, kind: NodeKind, parentId: string | null) => Promise<void>; onUpdate: (node: Taxon, name: string, kind: NodeKind) => Promise<void> }) {
  if (path.has(node.id)) return null;
  const children = edges.filter((edge) => edge.parentId === node.id).map((edge) => nodes.find((item) => item.id === edge.childId)).filter(Boolean) as Taxon[];
  const open = expanded.has(node.id);
  const nextPath = new Set(path).add(node.id);
  const parents = edges.filter((edge) => edge.childId === node.id).map((edge) => nodes.find((item) => item.id === edge.parentId)).filter(Boolean) as Taxon[];
  return <div className="taxonomy-branch">
    {editor?.type === "edit" && editor.nodeId === node.id ? <InlineTaxonForm mode="edit" initial={node} onSubmit={(name, kind) => onUpdate(node, name, kind)} onCancel={() => actions.setEditor(null)} depth={depth}/> : <div className={`taxon-row ${selected === node.id ? "selected" : ""}`} style={{ paddingLeft: 8 + depth * 22 }}>{depth > 0 ? <span className="taxonomy-branch-elbow" style={{ left: 20 + (depth - 1) * 22 }}/> : null}<button className="taxon-toggle" onClick={() => { const next = new Set(expanded); if (open) next.delete(node.id); else next.add(node.id); setExpanded(next); }}>{children.length ? (open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>) : <span/>}</button><button className="taxon-label" onClick={() => actions.setSelected(node.id)}><span>{node.name}</span><small>{labels[node.kind]}</small></button><button className="taxon-more" onClick={() => actions.setManageId(manageId === node.id ? undefined : node.id)} aria-label={`${node.name} 관리`}><MoreHorizontal size={17}/></button></div>}
    {manageId === node.id ? <InlineManage node={node} nodes={nodes} parents={parents} edges={edges} depth={depth} onAddChild={() => { actions.setEditor({ type: "add", parentId: node.id }); actions.setManageId(undefined); }} onEdit={() => { actions.setEditor({ type: "edit", nodeId: node.id }); actions.setManageId(undefined); }} onDelete={() => void actions.remove(node)} onAddParent={(parentId) => void actions.addParent(node.id, parentId)} onUnlink={(parentId) => void actions.unlink(node.id, parentId)} onClose={() => actions.setManageId(undefined)}/> : null}
    {editor?.type === "add" && editor.parentId === node.id ? <InlineTaxonForm mode="add" parent={node} onSubmit={(name, kind) => onCreate(name, kind, node.id)} onCancel={() => actions.setEditor(null)} depth={depth + 1}/> : null}
    {open && children.length ? <div className="taxonomy-children"><span className="taxonomy-depth-guide" style={{ left: 20 + depth * 22 }}/>{children.map((child) => <TreeBranch key={`${node.id}-${child.id}`} node={child} nodes={nodes} edges={edges} depth={depth + 1} path={nextPath} selected={selected} expanded={expanded} setExpanded={setExpanded} editor={editor} manageId={manageId} actions={actions} onCreate={onCreate} onUpdate={onUpdate}/>)}</div> : null}
  </div>;
}

function InlineTaxonForm({ mode, initial, parent, depth = 0, onSubmit, onCancel }: { mode: "add" | "edit"; initial?: Taxon; parent?: Taxon; depth?: number; onSubmit: (name: string, kind: NodeKind) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<NodeKind>(initial?.kind ?? (parent ? (parent.kind === "pathway" ? "class" : "subclass") : "pathway"));
  const kinds: NodeKind[] = parent ? ["class", "subclass"] : ["pathway", "class", "subclass"];
  return <form className="taxon-inline-form" style={{ marginLeft: 34 + depth * 22 }} onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit(name.trim(), kind); }}><input value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === "add" ? "새 분류 이름" : "분류 이름"} autoFocus/><select value={kind} onChange={(event) => setKind(event.target.value as NodeKind)}>{kinds.map((value) => <option value={value} key={value}>{labels[value]}</option>)}</select><button className="inline-primary">{mode === "add" ? "추가" : "저장"}</button><button type="button" onClick={onCancel}>취소</button></form>;
}

function InlineManage({ node, nodes, parents, edges, depth, onAddChild, onEdit, onDelete, onAddParent, onUnlink, onClose }: { node: Taxon; nodes: Taxon[]; parents: Taxon[]; edges: Edge[]; depth: number; onAddChild: () => void; onEdit: () => void; onDelete: () => void; onAddParent: (id: string) => void; onUnlink: (id: string) => void; onClose: () => void }) {
  const candidates = nodes.filter((candidate) => candidate.id !== node.id && !edges.some((edge) => edge.childId === node.id && edge.parentId === candidate.id));
  return <div className="taxon-inline-manage" style={{ marginLeft: 34 + depth * 22 }}><div className="inline-manage-actions"><button onClick={onAddChild}><Plus size={13}/> 하위 분류 추가</button><button onClick={onEdit}><Pencil size={13}/> 수정</button><button className="danger" onClick={onDelete}><Trash2 size={13}/> 삭제</button><button className="inline-manage-close" onClick={onClose}><X size={14}/></button></div><div className="inline-parent-editor"><span><Link2 size={13}/> 상위 분류</span>{parents.map((parent) => <span className="parent-chip" key={parent.id}>{parent.name}<button onClick={() => onUnlink(parent.id)} title="상위 연결 해제"><Unlink size={12}/></button></span>)}<select value="" onChange={(event) => onAddParent(event.target.value)}><option value="">+ 상위 분류 연결</option>{candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></div></div>;
}

function FlatTaxonRow({ node, selected, setSelected }: { node: Taxon; selected?: string; setSelected: (id: string) => void }) { return <div className={`taxon-row ${selected === node.id ? "selected" : ""}`}><span className="taxon-toggle"/><button className="taxon-label" onClick={() => setSelected(node.id)}><span>{node.name}</span><small>{labels[node.kind]}</small></button></div>; }

function ConstituentExplorer({ node }: { node?: Taxon }) {
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Constituent[]>([]);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!node) { setRows([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ taxonId: node.id, includeDescendants: String(includeDescendants), ...(query.trim() ? { q: query.trim() } : {}) });
        const response = await fetch(`/api/constituents?${params}`, { signal: controller.signal });
        const data = await response.json();
        setRows(data.constituents ?? []);
      } catch (error) { if ((error as Error).name !== "AbortError") setRows([]); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [node, includeDescendants, query]);
  if (!node) return <aside className="panel constituent-explorer empty-explorer">분류를 선택하면 연결된 constituent를 볼 수 있습니다.</aside>;
  return <aside className="panel constituent-explorer"><header><div><span>{labels[node.kind]}</span><h2>{node.name}</h2></div><strong>{rows.length}</strong></header><div className="constituent-scope" role="group" aria-label="조회 범위"><button className={includeDescendants ? "active" : ""} onClick={() => setIncludeDescendants(true)}>하위 분류 포함</button><button className={!includeDescendants ? "active" : ""} onClick={() => setIncludeDescendants(false)}>직접 연결만</button></div><div className="search-wrap constituent-search"><Search size={16}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Constituent 검색"/></div><div className="constituent-list">{loading ? <p className="muted">불러오는 중…</p> : rows.length ? rows.map((item) => <button className={selected === item.id ? "selected" : ""} key={item.id} onClick={() => setSelected(item.id)}><span>{item.name}</span>{item.aliases.length ? <small>{item.aliases.join(" · ")}</small> : null}{selected === item.id ? <Check size={15}/> : null}</button>) : <p className="muted">연결된 constituent가 없습니다.</p>}</div></aside>;
}
