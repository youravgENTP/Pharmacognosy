import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import taxonomyBase from "../data/constituent-taxonomy-base.json";

type NodeKind = "pathway" | "class" | "subclass";
type BaseNode = { name: string; kind: NodeKind; children?: BaseNode[] };
type FlatNode = { name: string; kind: NodeKind; position: number };

async function main() {
  const { db, databaseClient } = await import("../lib/db");
  const { constituents, constituentMemberships, constituentTaxa, constituentTaxonEdges } = await import("../lib/db/schema");
  const nodes = new Map<string, FlatNode>();
  const edges = new Set<string>();
  const keyOf = (value: { name: string; kind: string }) => `${value.kind}\u0000${value.name}`;
  let position = 0;
  function collect(items: BaseNode[], parentKey?: string) {
    for (const item of items) {
      const key = keyOf(item);
      if (!nodes.has(key)) nodes.set(key, { name: item.name, kind: item.kind, position: position++ });
      if (parentKey) edges.add(`${parentKey}\u0001${key}`);
      collect(item.children ?? [], key);
    }
  }
  collect(taxonomyBase.taxonomy as BaseNode[]);

  const renames: [string, string, string][] = [
    ["pathway", "MVA / MEP-DXP", "MVA / MEP-DXP 경로"], ["pathway", "Shikimate", "Shikimate 경로"], ["pathway", "Polyketide", "Polyketide 경로"],
    ["class", "Ornithine 유래", "Ornithine 유래 알칼로이드"],
    ["class", "Lysine 유래", "Lysine 유래 알칼로이드"], ["class", "Nicotinic acid 유래", "Nicotinic acid 유래 알칼로이드"],
    ["class", "Histidine 유래", "Histidine 유래 알칼로이드"], ["class", "Anthranilic acid 유래", "Anthranilic acid 유래 알칼로이드"],
    ["class", "Phe 유래", "Phe 유래 알칼로이드"], ["class", "Trp 유래", "Trp 유래 알칼로이드"],
  ];
  for (const [kind, previousName, name] of renames) {
    await db.update(constituentTaxa).set({ name, updatedAt: new Date() }).where(and(eq(constituentTaxa.kind, kind), eq(constituentTaxa.name, previousName)));
  }

  // Merge the accidentally duplicated amino-acid roots without losing DAG edges
  // or memberships. The broader “유래 성분” node is the canonical record.
  const currentTaxa = await db.select().from(constituentTaxa);
  const aminoComponent = currentTaxa.find((row) => row.kind === "pathway" && row.name === "Amino acid 유래 성분");
  const aminoAlkaloid = currentTaxa.find((row) => row.kind === "pathway" && row.name === "Amino acid 유래 알칼로이드");
  if (aminoAlkaloid && aminoComponent) {
    const duplicateEdges = await db.select().from(constituentTaxonEdges);
    const movedEdges = duplicateEdges.flatMap((edge) => {
      if (edge.parentId === aminoAlkaloid.id) return [{ ...edge, parentId: aminoComponent.id }];
      if (edge.childId === aminoAlkaloid.id) return [{ ...edge, childId: aminoComponent.id }];
      return [];
    }).filter((edge) => edge.parentId !== edge.childId);
    if (movedEdges.length) await db.insert(constituentTaxonEdges).values(movedEdges).onConflictDoNothing();
    const movedMemberships = (await db.select().from(constituentMemberships)).filter((row) => row.taxonId === aminoAlkaloid.id).map((row) => ({ ...row, taxonId: aminoComponent.id }));
    if (movedMemberships.length) await db.insert(constituentMemberships).values(movedMemberships).onConflictDoNothing();
    await db.delete(constituentTaxa).where(eq(constituentTaxa.id, aminoAlkaloid.id));
  } else if (aminoAlkaloid) {
    await db.update(constituentTaxa).set({ name: "Amino acid 유래 성분", updatedAt: new Date() }).where(eq(constituentTaxa.id, aminoAlkaloid.id));
  }

  await db.insert(constituentTaxa).values([...nodes.values()]).onConflictDoNothing();
  let taxonRows = await db.select().from(constituentTaxa);
  const idByKey = new Map(taxonRows.map((row) => [keyOf(row), row.id]));
  const edgeRows = [...edges].flatMap((edge) => {
    const [parentKey, childKey] = edge.split("\u0001");
    const parentId = idByKey.get(parentKey), childId = idByKey.get(childKey);
    return parentId && childId ? [{ parentId, childId }] : [];
  });
  if (edgeRows.length) await db.insert(constituentTaxonEdges).values(edgeRows).onConflictDoNothing();

  const legacyTaxa = new Set([
    "subclass\u0000Saponin", "subclass\u0000Steroid", "class\u0000Phthalide", "class\u0000Phloroglucinol 유도체",
    "class\u0000Flavonoid", "class\u0000Alkaloid", "subclass\u0000Isoquinoline Alkaloid", "subclass\u0000Indole Alkaloid",
  ]);
  for (const taxon of taxonRows) if (taxon.kind === "compound" || legacyTaxa.has(keyOf(taxon))) {
    await db.update(constituentTaxa).set({ hidden: true, updatedAt: new Date() }).where(eq(constituentTaxa.id, taxon.id));
  }

  // Compatibility migration: copy legacy compound taxonomy leaves into the
  // normalized constituent tables. Compound taxa remain in place deliberately;
  // the UI/API hide them, and they can be removed in a later audited migration.
  const compoundTaxa = taxonRows.filter((taxon) => taxon.kind === "compound");
  if (compoundTaxa.length) await db.insert(constituents).values(compoundTaxa.map((taxon) => ({ name: taxon.name }))).onConflictDoNothing();
  const constituentRows = await db.select().from(constituents);
  const constituentIdByName = new Map(constituentRows.map((row) => [row.name, row.id]));
  const allEdges = await db.select().from(constituentTaxonEdges);
  const normalizedParents = new Map([
    ["Zingiberene", "class\u0000Sesquiterpenoid"], ["6-Gingerol", "class\u0000DiarylHeptanoid"],
    ["6-Shogaol", "class\u0000DiarylHeptanoid"], ["Berberine", "subclass\u0000BenzylTetrahydroisoquinoline"],
  ]);
  const memberships = compoundTaxa.flatMap((taxon) => {
    const constituentId = constituentIdByName.get(taxon.name);
    if (!constituentId) return [];
    const taxonIds = new Set(allEdges.filter((edge) => edge.childId === taxon.id).map((edge) => edge.parentId));
    const normalizedParent = normalizedParents.get(taxon.name);
    if (normalizedParent && idByKey.get(normalizedParent)) taxonIds.add(idByKey.get(normalizedParent)!);
    return [...taxonIds].map((taxonId) => ({ constituentId, taxonId }));
  });
  if (memberships.length) await db.insert(constituentMemberships).values(memberships).onConflictDoNothing();

  taxonRows = await db.select().from(constituentTaxa).where(eq(constituentTaxa.kind, "compound"));
  console.log(`Taxonomy base merged: ${nodes.size} unique taxa, ${edgeRows.length} edges. ${taxonRows.length} legacy compound taxa preserved and hidden.`);
  await databaseClient.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
