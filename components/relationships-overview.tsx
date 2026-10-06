"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDrugIndex } from "@/lib/drug-index";

type RelationshipType = "연관생약" | "유사생약";
type DrugNode = { id: string; name: string; catalogIndex: number | null; referenceIndex: number | null };
export type RelationshipEdge = { id: string; type: RelationshipType; source: DrugNode; target: DrugNode };
type Filter = "전체" | RelationshipType;
type Cluster = { key: string; type: RelationshipType; nodes: DrugNode[]; edges: RelationshipEdge[] };

export function RelationshipsOverview({ edges }: { edges: RelationshipEdge[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("전체");
  const clusters = useMemo(() => buildClusters(edges), [edges]);
  const visible = useMemo(() => {
    const needle = normalize(query);
    return clusters.filter((cluster) => (filter === "전체" || cluster.type === filter) && (!needle || cluster.nodes.some((node) => normalize(node.name).includes(needle) || normalize(formatDrugIndex(node.catalogIndex, node.referenceIndex)).includes(needle))));
  }, [clusters, filter, query]);
  const relatedCount = edges.filter((edge) => edge.type === "연관생약").length;
  const similarCount = edges.filter((edge) => edge.type === "유사생약").length;

  return <>
    <header className="db-header relationships-header"><div><h1>Herb Relations</h1><p className="subtitle">유사·연관 생약의 연결을 묶음 단위로 한눈에 확인하세요.</p></div><div className="search-wrap"><Search size={18}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="생약명 또는 인덱스 검색" aria-label="관계 생약 검색"/></div></header>
    <div className="relationship-overview-summary"><span><b>{edges.length}</b>개 연결</span><span><b>{relatedCount}</b>개 연관</span><span><b>{similarCount}</b>개 유사</span><span><b>{clusters.length}</b>개 묶음</span></div>
    <div className="relationship-filter-tabs" role="group" aria-label="관계 유형 필터">{(["전체", "연관생약", "유사생약"] as Filter[]).map((value) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div>
    {visible.length ? <div className="relationship-cluster-grid">{visible.map((cluster) => <article className={`relationship-cluster ${cluster.type === "유사생약" ? "similar" : "related"}`} key={cluster.key}>
      <header><span>{cluster.type}</span><small>{cluster.nodes.length}개 생약 · {cluster.edges.length}개 연결</small></header>
      <div className="relationship-cluster-members">{cluster.nodes.map((node) => <Link href={`/drugs/${node.id}`} scroll={false} key={node.id}><small>{formatDrugIndex(node.catalogIndex, node.referenceIndex)}</small><strong>{node.name}</strong></Link>)}</div>
      <div className="relationship-edge-list">{cluster.edges.map((edge) => <div key={edge.id}><Link href={`/drugs/${edge.source.id}`} scroll={false}>{edge.source.name}</Link><span>↔</span><Link href={`/drugs/${edge.target.id}`} scroll={false}>{edge.target.name}</Link></div>)}</div>
    </article>)}</div> : <div className="empty">검색 조건에 맞는 관계가 없습니다.</div>}
  </>;
}

function buildClusters(edges: RelationshipEdge[]): Cluster[] {
  return (["유사생약", "연관생약"] as RelationshipType[]).flatMap((type) => {
    const typed = edges.filter((edge) => edge.type === type);
    const remaining = new Set(typed.map((edge) => edge.id));
    const clusters: Cluster[] = [];
    while (remaining.size) {
      const firstId = remaining.values().next().value as string;
      const clusterEdges: RelationshipEdge[] = [];
      const nodeIds = new Set<string>();
      const first = typed.find((edge) => edge.id === firstId)!;
      const pending = [first.source.id, first.target.id];
      while (pending.length) {
        const nodeId = pending.pop()!;
        if (nodeIds.has(nodeId)) continue;
        nodeIds.add(nodeId);
        for (const edge of typed) {
          if (!remaining.has(edge.id) || edge.source.id !== nodeId && edge.target.id !== nodeId) continue;
          remaining.delete(edge.id); clusterEdges.push(edge);
          pending.push(edge.source.id === nodeId ? edge.target.id : edge.source.id);
        }
      }
      const nodeMap = new Map<string, DrugNode>();
      for (const edge of clusterEdges) { nodeMap.set(edge.source.id, edge.source); nodeMap.set(edge.target.id, edge.target); }
      const nodes = [...nodeMap.values()].sort(sortDrug);
      clusters.push({ key: `${type}-${nodes.map((node) => node.id).join("-")}`, type, nodes, edges: clusterEdges.sort((a, b) => sortDrug(a.source, b.source) || sortDrug(a.target, b.target)) });
    }
    return clusters;
  }).sort((a, b) => a.type.localeCompare(b.type, "ko") || sortDrug(a.nodes[0], b.nodes[0]));
}

function sortDrug(a: DrugNode, b: DrugNode) {
  return (a.catalogIndex ?? Number.MAX_SAFE_INTEGER) - (b.catalogIndex ?? Number.MAX_SAFE_INTEGER) || (a.referenceIndex ?? Number.MAX_SAFE_INTEGER) - (b.referenceIndex ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ko");
}
function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s/g, ""); }
