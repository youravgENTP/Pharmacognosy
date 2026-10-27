import { compareDrugIndexes } from "@/lib/drug-index";

export type RelationshipArchiveStatus = "active" | "mixed" | "archived";
export type RelationshipNode = { id: string; catalogIndex: number | null; referenceIndex: number | null; archive?: { prefix: string; name: string; originalIndex: number } | null };
export type ClusterableRelationship<N extends RelationshipNode = RelationshipNode> = { id: string; type: string; source: N; target: N; status: RelationshipArchiveStatus };

export function classifyRelationship(sourceArchived: boolean, targetArchived: boolean): RelationshipArchiveStatus {
  if (sourceArchived && targetArchived) return "archived";
  if (sourceArchived || targetArchived) return "mixed";
  return "active";
}

/** Connected components are built only within one archive status to prevent cross-state clusters. */
export function buildRelationshipClusters<E extends ClusterableRelationship>(edges: E[]) {
  const clusters: { key: string; type: string; status: RelationshipArchiveStatus; nodes: E["source"][]; edges: E[] }[] = [];
  const groupKeys = [...new Set(edges.map((edge) => `${edge.status}\u0000${edge.type}`))];
  for (const groupKey of groupKeys) {
    const [status, type] = groupKey.split("\u0000") as [RelationshipArchiveStatus, string];
    const typed = edges.filter((edge) => edge.status === status && edge.type === type);
    const remaining = new Set(typed.map((edge) => edge.id));
    while (remaining.size) {
      const firstId = remaining.values().next().value as string;
      const clusterEdges: E[] = [];
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
      const nodeMap = new Map<string, E["source"]>();
      for (const edge of clusterEdges) { nodeMap.set(edge.source.id, edge.source); nodeMap.set(edge.target.id, edge.target as E["source"]); }
      const nodes = [...nodeMap.values()].sort(compareDrugIndexes);
      clusters.push({ key: `${status}-${type}-${nodes.map((node) => node.id).join("-")}`, type, status, nodes, edges: clusterEdges.sort((a, b) => compareDrugIndexes(a.source, b.source) || compareDrugIndexes(a.target, b.target)) });
    }
  }
  return clusters.sort((a, b) => a.status.localeCompare(b.status) || a.type.localeCompare(b.type, "ko") || compareDrugIndexes(a.nodes[0], b.nodes[0]));
}
