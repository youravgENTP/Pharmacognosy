"use client";

import { Network, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DrugEditor } from "@/components/drug-editor";
import type { ImportanceLevel, OriginPlant, StudySection } from "@/lib/db/schema";
import { formatDrugIndex } from "@/lib/drug-index";

type RelationshipType = "연관생약" | "유사생약";
type DrugNode = { id: string; name: string; catalogIndex: number | null; referenceIndex: number | null };
export type RelationshipEdge = { id: string; type: RelationshipType; source: DrugNode; target: DrugNode };
type Filter = "전체" | RelationshipType;
type Cluster = { key: string; type: RelationshipType; nodes: DrugNode[]; edges: RelationshipEdge[] };
type DrugProfile = {
  id: string; koreanName: string; latinName: string | null; origin: string | null; origins: OriginPlant[]; scientificName: string | null;
  medicinalPart: string | null; familyId: string | null; importance: ImportanceLevel; sections: StudySection[]; family: string | null;
  identityTerms: { id: string; name: string }[];
  relatedDrugs: { id: string; drugId: string; catalogIndex: number | null; referenceIndex: number | null; name: string }[];
  similarDrugs: { id: string; drugId: string; catalogIndex: number | null; referenceIndex: number | null; name: string }[];
  availableDrugs: { id: string; catalogIndex: number | null; referenceIndex: number | null; name: string; latinName?: string | null }[];
};

export function RelationshipsOverview({ edges }: { edges: RelationshipEdge[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("전체");
  const [mapKey, setMapKey] = useState<string>();
  const [comparison, setComparison] = useState<RelationshipEdge>();
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
      <header><span>{cluster.type}</span><div><small>{cluster.nodes.length}개 생약 · {cluster.edges.length}개 연결</small>{cluster.nodes.length >= 3 ? <button className={mapKey === cluster.key ? "active" : ""} onClick={() => setMapKey((current) => current === cluster.key ? undefined : cluster.key)} aria-label={`${cluster.type} 네트워크 지도`}><Network size={14}/> 연결 지도</button> : null}</div></header>
      {mapKey === cluster.key ? <RelationshipMap cluster={cluster} onClose={() => setMapKey(undefined)}/> : null}
      <div className="relationship-cluster-members">{cluster.nodes.map((node) => <Link href={`/drugs/${node.id}`} scroll={false} key={node.id}><small>{formatDrugIndex(node.catalogIndex, node.referenceIndex)}</small><strong>{node.name}</strong></Link>)}</div>
      <div className="relationship-edge-list">{cluster.edges.map((edge) => <button type="button" onClick={() => setComparison(edge)} key={edge.id}><span>{edge.source.name}</span><b>↔</b><span>{edge.target.name}</span></button>)}</div>
    </article>)}</div> : <div className="empty">검색 조건에 맞는 관계가 없습니다.</div>}
    {comparison ? <RelationshipComparison edge={comparison} onClose={() => setComparison(undefined)}/> : null}
  </>;
}

function RelationshipMap({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const center = 150; const radius = cluster.nodes.length > 7 ? 103 : 88;
  const points = new Map(cluster.nodes.map((node, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / cluster.nodes.length; return [node.id, { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius }] as const; }));
  return <aside className="relationship-map-popover"><header><div><Network size={15}/><strong>연결 구조</strong></div><button onClick={onClose} aria-label="연결 지도 닫기"><X size={15}/></button></header><svg viewBox="0 0 300 300" role="img" aria-label={`${cluster.type} 연결 네트워크`}>
    {cluster.edges.map((edge) => { const from = points.get(edge.source.id)!; const to = points.get(edge.target.id)!; return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} key={edge.id}/>; })}
    {cluster.nodes.map((node) => { const point = points.get(node.id)!; return <g transform={`translate(${point.x} ${point.y})`} key={node.id}><circle r="27"/><text textAnchor="middle" dominantBaseline="central">{shortName(node.name)}</text></g>; })}
  </svg><p>선은 직접 등록된 관계를 의미합니다.</p></aside>;
}

function RelationshipComparison({ edge, onClose }: { edge: RelationshipEdge; onClose: () => void }) {
  const [profiles, setProfiles] = useState<DrugProfile[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([edge.source.id, edge.target.id].map((id) => fetch(`/api/drugs/${id}`, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<DrugProfile>; }))).then(setProfiles).catch((reason) => { if (reason.name !== "AbortError") setError(true); });
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    return () => { controller.abort(); document.body.style.overflow = previous; window.removeEventListener("keydown", keydown); };
  }, [edge, onClose]);
  return <div className="relationship-compare-backdrop" role="dialog" aria-modal="true" aria-label={`${edge.source.name}과 ${edge.target.name} 비교`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="relationship-compare-dialog"><header><div><strong>{edge.source.name} ↔ {edge.target.name}</strong><span>{edge.type} 데이터카드 비교</span></div><button onClick={onClose} aria-label="비교 닫기"><X size={20}/></button></header>{error ? <div className="relationship-compare-status">데이터카드를 불러오지 못했습니다.</div> : !profiles ? <div className="relationship-compare-status">두 데이터카드를 불러오는 중…</div> : <div className="relationship-compare-grid">{profiles.map((profile) => <div className="relationship-compare-pane" key={profile.id}><DrugEditor modal id={profile.id} family={profile.family} identityTerms={profile.identityTerms} relatedDrugs={profile.relatedDrugs} similarDrugs={profile.similarDrugs} availableDrugs={profile.availableDrugs} initial={{ koreanName: profile.koreanName, latinName: profile.latinName, origin: profile.origin, origins: profile.origins, scientificName: profile.scientificName, medicinalPart: profile.medicinalPart, familyId: profile.familyId, importance: profile.importance, sections: profile.sections }}/></div>)}</div>}</section></div>;
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

function sortDrug(a: DrugNode, b: DrugNode) { return (a.catalogIndex ?? Number.MAX_SAFE_INTEGER) - (b.catalogIndex ?? Number.MAX_SAFE_INTEGER) || (a.referenceIndex ?? Number.MAX_SAFE_INTEGER) - (b.referenceIndex ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ko"); }
function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s/g, ""); }
function shortName(value: string) { return value.length > 7 ? `${value.slice(0, 6)}…` : value; }
