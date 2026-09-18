import { config } from "dotenv";
config({ path: ".env.local" });

import type { StudyItem, StudySection } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
const { db, databaseClient } = await import("../lib/db");
const { categories, constituentTaxa, constituentTaxonEdges, crudeDrugs, decks, families, relationshipTypes } = await import("../lib/db/schema");

const categoryData = [
  { name: "과실류", slug: "fructus", position: 1 },
  { name: "전초류", slug: "herba", position: 2 },
  { name: "종자류", slug: "semen", position: 3 },
  { name: "근경류", slug: "rhizoma", position: 4 },
];

for (const category of categoryData) {
  await db.insert(categories).values(category).onConflictDoUpdate({ target: categories.slug, set: { name: category.name, position: category.position } });
}

await db.insert(families).values([
  { koreanName: "생강과", scientificName: "Zingiberaceae" },
  { koreanName: "미나리아재비과", scientificName: "Ranunculaceae" },
  { koreanName: "콩과", scientificName: "Fabaceae" },
]).onConflictDoNothing();

const categoryRows = await db.select().from(categories);
const familyRows = await db.select().from(families);
const categoryId = (name: string) => categoryRows.find((row) => row.name === name)!.id;
const familyId = (name: string) => familyRows.find((row) => row.scientificName === name)?.id;
const item = (text: string, children?: StudyItem[]): StudyItem => ({ id: crypto.randomUUID(), text, ...(children ? { children } : {}) });
const section = (title: string, items: StudyItem[]): StudySection => ({ id: crypto.randomUUID(), title, items });

const drugData = [
  { koreanName: "오미자", latinName: "Schisandrae Fructus", origin: "오미자의 잘 익은 열매", scientificName: "Schisandra chinensis", categoryId: categoryId("과실류"), importance: "중요" as const, sections: [section("성분", [item("Lignan", [item("Schizandrin (정량성분)"), item("Gomisin A")])]), section("응용", [item("수렴·진해 작용")])] },
  { koreanName: "산수유", latinName: "Corni Fructus", origin: "산수유나무의 잘 익은 열매에서 씨를 제거한 것", scientificName: "Cornus officinalis", categoryId: categoryId("과실류"), importance: "중간" as const, sections: [section("성분", [item("Iridoid glycoside", [item("Loganin")])]), section("암기법", [item("산수유—Loganin 연결")])] },
  { koreanName: "익모초", latinName: "Leonuri Herba", origin: "익모초의 지상부", scientificName: "Leonurus japonicus", categoryId: categoryId("전초류"), importance: "중간" as const, sections: [section("성분", [item("Alkaloid", [item("Leonurine")])]), section("약리", [item("자궁 관련 작용 (세부 내용 보충)")])] },
  { koreanName: "마황", latinName: "Ephedrae Herba", origin: "초마황 등의 지상경", scientificName: "Ephedra sinica", categoryId: categoryId("전초류"), importance: "중요" as const, sections: [section("성분", [item("Alkaloid", [item("Ephedrine (정량성분)"), item("Pseudoephedrine")])]), section("주의·부작용·독성", [item("교감신경 흥분 관련 주의")])] },
  { koreanName: "행인", latinName: "Armeniacae Semen", origin: "살구나무 등의 잘 익은 씨", scientificName: "Prunus armeniaca", categoryId: categoryId("종자류"), importance: "중요" as const, sections: [section("성분", [item("Cyanogenic glycoside", [item("Amygdalin")])]), section("주의·부작용·독성", [item("과량 사용 주의")])] },
  { koreanName: "결명자", latinName: "Cassiae Semen", origin: "결명 등의 잘 익은 씨", scientificName: "Senna obtusifolia", categoryId: categoryId("종자류"), familyId: familyId("Fabaceae"), importance: "비중요" as const, sections: [section("성분", [item("Anthraquinone 유도체")])] },
  { koreanName: "건강", latinName: "Zingiberis Rhizoma", origin: "생강의 뿌리줄기를 말린 것", scientificName: "Zingiber officinale", medicinalPart: "뿌리줄기", categoryId: categoryId("근경류"), familyId: familyId("Zingiberaceae"), importance: "중요" as const, sections: [section("성분", [item("정유성분", [item("Sesquiterpenoid", [item("Zingiberene")])]), item("신미성분", [item("Diarylheptanoid 유사체", [item("6-Gingerol (정량성분)"), item("6-Shogaol"), item("Zingerone")])])]), section("연관생약", [item("생강 (가공/연관)")])] },
  { koreanName: "황련", latinName: "Coptidis Rhizoma", origin: "황련 등의 뿌리를 제거한 뿌리줄기", scientificName: "Coptis japonica", medicinalPart: "뿌리줄기", categoryId: categoryId("근경류"), familyId: familyId("Ranunculaceae"), importance: "중요" as const, sections: [section("성분", [item("Isoquinoline alkaloid", [item("Berberine (정량성분)")])]), section("확인시험", [item("Berberine 확인반응")])] },
];

for (const drug of drugData) await db.insert(crudeDrugs).values(drug).onConflictDoNothing({ target: crudeDrugs.koreanName });
for (const name of ["유사생약", "가공/연관"]) await db.insert(relationshipTypes).values({ name }).onConflictDoNothing();
const [deck] = await db.select().from(decks).where(eq(decks.name, "핵심 생약")).limit(1);
if (!deck) await db.insert(decks).values({ name: "핵심 생약", description: "직접 카드를 추가해 보세요." });

const taxonomy: { name: string; kind: "pathway" | "class" | "subclass" | "compound"; parent?: string }[] = [
  { name: "MVA / MEP-DXP", kind: "pathway" }, { name: "Monoterpenoid", kind: "class", parent: "MVA / MEP-DXP" }, { name: "Iridoid", kind: "subclass", parent: "Monoterpenoid" }, { name: "Secoiridoid", kind: "subclass", parent: "Monoterpenoid" }, { name: "Sesquiterpenoid", kind: "class", parent: "MVA / MEP-DXP" }, { name: "Diterpenoid", kind: "class", parent: "MVA / MEP-DXP" }, { name: "Triterpenoid", kind: "class", parent: "MVA / MEP-DXP" }, { name: "Saponin", kind: "subclass", parent: "Triterpenoid" }, { name: "Steroid", kind: "subclass", parent: "Triterpenoid" },
  { name: "Shikimate", kind: "pathway" }, { name: "Phenylpropanoid", kind: "class", parent: "Shikimate" },
  { name: "Polyketide", kind: "pathway" }, { name: "Quinone", kind: "class", parent: "Polyketide" }, { name: "Anthraquinone", kind: "subclass", parent: "Quinone" }, { name: "Phthalide", kind: "class", parent: "Polyketide" }, { name: "Phloroglucinol 유도체", kind: "class", parent: "Polyketide" },
  { name: "복합경로", kind: "pathway" }, { name: "Flavonoid", kind: "class", parent: "복합경로" }, { name: "Tannin", kind: "class", parent: "복합경로" }, { name: "DiarylHeptanoid", kind: "class", parent: "복합경로" },
  { name: "Amino acid 유래", kind: "pathway" }, { name: "Alkaloid", kind: "class", parent: "Amino acid 유래" }, { name: "Isoquinoline Alkaloid", kind: "subclass", parent: "Alkaloid" }, { name: "Indole Alkaloid", kind: "subclass", parent: "Alkaloid" },
  { name: "Zingiberene", kind: "compound", parent: "Sesquiterpenoid" }, { name: "6-Gingerol", kind: "compound", parent: "DiarylHeptanoid" }, { name: "6-Shogaol", kind: "compound", parent: "DiarylHeptanoid" }, { name: "Berberine", kind: "compound", parent: "Isoquinoline Alkaloid" },
];
for (const node of taxonomy) await db.insert(constituentTaxa).values({ name: node.name, kind: node.kind }).onConflictDoNothing();
const taxonRows = await db.select().from(constituentTaxa);
const taxonId = (name: string) => taxonRows.find((row) => row.name === name)!.id;
for (const node of taxonomy.filter((entry) => entry.parent)) await db.insert(constituentTaxonEdges).values({ parentId: taxonId(node.parent!), childId: taxonId(node.name) }).onConflictDoNothing();
for (const [parent, child] of [["Shikimate", "Flavonoid"], ["Polyketide", "Flavonoid"]]) await db.insert(constituentTaxonEdges).values({ parentId: taxonId(parent), childId: taxonId(child) }).onConflictDoNothing();

console.log(`Seed complete: ${drugData.length} example crude drugs prepared.`);
await databaseClient.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
