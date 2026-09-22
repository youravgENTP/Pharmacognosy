export type TaxonomyEdge = { parentId: string; childId: string };

export type ParentLinkError = "missing-parent" | "missing-child" | "self-parent" | "cycle";

export function hasDirectedPath(edges: TaxonomyEdge[], startId: string, targetId: string) {
  const children = new Map<string, string[]>();
  for (const edge of edges) children.set(edge.parentId, [...(children.get(edge.parentId) ?? []), edge.childId]);
  const seen = new Set<string>();
  const queue = [startId];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current === targetId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const childId of children.get(current) ?? []) if (!seen.has(childId)) queue.push(childId);
  }
  return false;
}

export function validateParentLink(nodeIds: Set<string>, edges: TaxonomyEdge[], childId: string, parentId: string): ParentLinkError | undefined {
  if (!nodeIds.has(parentId)) return "missing-parent";
  if (!nodeIds.has(childId)) return "missing-child";
  if (childId === parentId) return "self-parent";
  if (hasDirectedPath(edges, childId, parentId)) return "cycle";
}

export function descendantIds(rootId: string, edges: TaxonomyEdge[]) {
  const children = new Map<string, string[]>();
  for (const edge of edges) children.set(edge.parentId, [...(children.get(edge.parentId) ?? []), edge.childId]);
  const found = new Set([rootId]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index++) {
    for (const childId of children.get(queue[index]) ?? []) if (!found.has(childId)) {
      found.add(childId);
      queue.push(childId);
    }
  }
  return found;
}

// Hierarchy depth is never clamped. Only the number of indentation pixels is.
export function taxonomyIndent(depth: number) {
  const normalized = Math.max(0, depth);
  return Math.min(normalized, 4) * 22 + Math.max(0, normalized - 4) * 10;
}
