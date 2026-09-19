import type { ConceptAnchorTargetRef } from "@/lib/db/schema";

export function serializeConceptAnchorTargetRef(targetRef: ConceptAnchorTargetRef) {
  const entries = Object.entries(targetRef)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);

  return JSON.stringify(Object.fromEntries(entries));
}
