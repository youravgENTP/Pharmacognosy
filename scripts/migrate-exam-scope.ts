import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import type { ImportanceLevel, StudySection } from "../lib/db/schema";
import originSeed from "../data/origin-plants.json";

const records = [
  {
    "catalogIndex": 1,
    "koreanName": "개자",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 2,
    "koreanName": "견우자",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 3,
    "koreanName": "빈랑자",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 4,
    "koreanName": "육두구",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 5,
    "koreanName": "차전자",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 6,
    "koreanName": "카라발두",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 7,
    "koreanName": "커피두",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 8,
    "koreanName": "콜히쿰자",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 9,
    "koreanName": "파두",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 10,
    "koreanName": "행인",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 11,
    "koreanName": "도인",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 12,
    "koreanName": "호미카",
    "category": "종자류",
    "importance": "중요"
  },
  {
    "catalogIndex": 13,
    "koreanName": "보골지",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 14,
    "koreanName": "비자",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 15,
    "koreanName": "산조인",
    "category": "종자류",
    "importance": "중간"
  },
  {
    "catalogIndex": 16,
    "koreanName": "여지핵",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 17,
    "koreanName": "백자인",
    "category": "종자류",
    "importance": "중간"
  },
  {
    "catalogIndex": 18,
    "koreanName": "스트로판투스",
    "category": "종자류",
    "importance": "중간"
  },
  {
    "catalogIndex": 19,
    "koreanName": "연자육",
    "category": "종자류",
    "importance": "중간"
  },
  {
    "catalogIndex": 20,
    "koreanName": "의이인",
    "category": "종자류",
    "importance": "중간"
  },
  {
    "catalogIndex": 21,
    "koreanName": "결명자",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 22,
    "koreanName": "괄루인",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 23,
    "koreanName": "내복자",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 24,
    "koreanName": "대풍자",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 25,
    "koreanName": "백편두",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 26,
    "koreanName": "부소맥",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 27,
    "koreanName": "아마인",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 28,
    "koreanName": "정력자",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 29,
    "koreanName": "토사자",
    "category": "종자류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 30,
    "koreanName": "고추",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 31,
    "koreanName": "대추",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 32,
    "koreanName": "마리아엉겅퀴",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 33,
    "koreanName": "산사",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 34,
    "koreanName": "산수유",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 35,
    "koreanName": "산초",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 36,
    "koreanName": "연교",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 37,
    "koreanName": "오미자",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 38,
    "koreanName": "지실",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 39,
    "koreanName": "진피",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 40,
    "koreanName": "치자",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 41,
    "koreanName": "홉,호프",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 42,
    "koreanName": "회향",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 43,
    "koreanName": "팔각회향",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 44,
    "koreanName": "후추",
    "category": "과실류",
    "importance": "중요"
  },
  {
    "catalogIndex": 45,
    "koreanName": "구기자",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 46,
    "koreanName": "소두구",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 47,
    "koreanName": "백두구",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 48,
    "koreanName": "초과",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 49,
    "koreanName": "초두구",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 50,
    "koreanName": "용안육",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 51,
    "koreanName": "청피",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 52,
    "koreanName": "귤핵",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 53,
    "koreanName": "등피",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 54,
    "koreanName": "복분자",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 55,
    "koreanName": "영실",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 56,
    "koreanName": "오수유",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 57,
    "koreanName": "우방자",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 58,
    "koreanName": "지구자",
    "category": "과실류",
    "importance": "중간"
  },
  {
    "catalogIndex": 59,
    "koreanName": "사군자",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 60,
    "koreanName": "사상자",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 61,
    "koreanName": "사인",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 62,
    "koreanName": "여정실",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 63,
    "koreanName": "예지자",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 64,
    "koreanName": "오매",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 65,
    "koreanName": "익지",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 66,
    "koreanName": "자실",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 67,
    "koreanName": "질려자",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 68,
    "koreanName": "창이자",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 69,
    "koreanName": "천련자",
    "category": "과실류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 70,
    "koreanName": "광곽향",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 71,
    "koreanName": "당약",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 72,
    "koreanName": "대마",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 73,
    "koreanName": "로베리아초",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 74,
    "koreanName": "마황",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 75,
    "koreanName": "박하",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 76,
    "koreanName": "빈카",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 77,
    "koreanName": "음양곽",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 78,
    "koreanName": "인진호",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 79,
    "koreanName": "애엽",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 80,
    "koreanName": "청호",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 81,
    "koreanName": "현초",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 82,
    "koreanName": "히페리시초",
    "category": "전초류",
    "importance": "중요"
  },
  {
    "catalogIndex": 83,
    "koreanName": "사향초",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 84,
    "koreanName": "삼백초",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 85,
    "koreanName": "어성초",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 86,
    "koreanName": "용아초",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 87,
    "koreanName": "상기생",
    "category": "전초류",
    "importance": "중간"
  },
  {
    "catalogIndex": 88,
    "koreanName": "익모초",
    "category": "전초류",
    "importance": "중간"
  },
  {
    "catalogIndex": 89,
    "koreanName": "구절초",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 90,
    "koreanName": "대계",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 91,
    "koreanName": "백굴채",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 92,
    "koreanName": "석곡",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 93,
    "koreanName": "용규",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 94,
    "koreanName": "육종용(열당)",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 95,
    "koreanName": "자소엽",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 96,
    "koreanName": "포공영",
    "category": "전초류",
    "importance": "비중요"
  },
  {
    "catalogIndex": 97,
    "koreanName": "향유",
    "category": "전초류",
    "importance": "비중요"
  }
] as const;
const relationPairs = [
  [
    "귤핵",
    "지실"
  ],
  [
    "귤핵",
    "진피"
  ],
  [
    "대추",
    "산조인"
  ],
  [
    "도인",
    "행인"
  ],
  [
    "등피",
    "지실"
  ],
  [
    "등피",
    "진피"
  ],
  [
    "백두구",
    "소두구"
  ],
  [
    "백두구",
    "초과"
  ],
  [
    "백두구",
    "초두구"
  ],
  [
    "비자",
    "육두구"
  ],
  [
    "삼백초",
    "어성초"
  ],
  [
    "소두구",
    "초과"
  ],
  [
    "소두구",
    "초두구"
  ],
  [
    "애엽",
    "인진호"
  ],
  [
    "여지핵",
    "용안육"
  ],
  [
    "용아초",
    "현초"
  ],
  [
    "인진호",
    "청호"
  ],
  [
    "지실",
    "진피"
  ],
  [
    "지실",
    "청피"
  ],
  [
    "진피",
    "청피"
  ],
  [
    "초과",
    "초두구"
  ],
  [
    "팔각회향",
    "회향"
  ]
] as const;
const defaultFields = [
  { name: "성분", position: 10, inputMode: "hierarchy4" as const },
  { name: "확인시험", position: 20, inputMode: "hierarchy3" as const },
  { name: "규격시험·정량·기준", position: 30, inputMode: "hierarchy3" as const },
  { name: "약리", position: 40, inputMode: "hierarchy4" as const },
  { name: "응용", position: 50, inputMode: "hierarchy4" as const },
  { name: "처방·생약유래 의약품", position: 60, inputMode: "hierarchy4" as const },
  { name: "주의·부작용·독성", position: 70, inputMode: "hierarchy4" as const },
  { name: "기타", position: 80, inputMode: "hierarchy4" as const },
  { name: "암기법", position: 90, inputMode: "hierarchy4" as const },
] as const;

const normalizedOriginName = (name: string) => ({ "개자 (겨자)": "개자", "홉, 호프": "홉,호프", "육종용": "육종용(열당)" }[name] ?? name);
const originByDrug = new Map(originSeed.categories.flatMap((category) => category.drugs.map((drug) => [normalizedOriginName(drug.name_ko), drug] as const)));

async function main() {
  const { db, databaseClient } = await import("../lib/db");
  const { categories, crudeDrugRelationships, crudeDrugs, fieldDefinitions, relationshipTypes } = await import("../lib/db/schema");

  for (const [position, name] of ["과실류", "전초류", "종자류"].entries()) {
    await db.insert(categories).values({ name, slug: { 종자류: "semen", 과실류: "fructus", 전초류: "herba" }[name]!, position: position + 1 })
      .onConflictDoUpdate({ target: categories.slug, set: { name, position: position + 1 } });
  }
  for (const field of defaultFields) {
    await db.insert(fieldDefinitions).values({ ...field, kind: "default", active: true })
      .onConflictDoUpdate({ target: fieldDefinitions.name, set: { kind: "default", inputMode: field.inputMode, position: field.position, active: true, updatedAt: new Date() } });
  }

  const existingBefore = await db.select().from(crudeDrugs);
  const aliases: Record<string, string> = { "확인시험법": "확인시험", "주의 및 부작용 / 독성": "주의·부작용·독성" };
  const defaultNames = new Set<string>(defaultFields.map((field) => field.name));
  const customNames = new Set<string>();
  for (const drug of existingBefore) for (const section of drug.sections) {
    const title = aliases[section.title] ?? section.title;
    if (title !== "연관생약" && !defaultNames.has(title)) customNames.add(title);
  }
  let customPosition = 100;
  for (const name of customNames) {
    await db.insert(fieldDefinitions).values({ name, kind: "custom", position: customPosition++, active: true }).onConflictDoNothing();
  }

  const [categoryRows, definitionRows] = await Promise.all([db.select().from(categories), db.select().from(fieldDefinitions)]);
  const categoryId = new Map(categoryRows.map((row) => [row.name, row.id]));
  const definitionByName = new Map(definitionRows.map((row) => [row.name, row]));
  const definitionById = new Map(definitionRows.map((row) => [row.id, row]));
  const normalizeSections = (input: StudySection[]) => {
    const seen = new Set<string>();
    const sections = input.flatMap((section) => {
      const title = aliases[section.title] ?? section.title;
      if (title === "연관생약" || seen.has(title)) return [];
      seen.add(title);
      const definition = definitionByName.get(title);
      return [{ ...section, title, ...(definition ? { fieldDefinitionId: definition.id } : {}) }];
    });
    for (const field of defaultFields) if (!seen.has(field.name)) {
      const definition = definitionByName.get(field.name)!;
      sections.push({ id: crypto.randomUUID(), fieldDefinitionId: definition.id, title: field.name, items: [] });
    }
    return sections.sort((left, right) => {
      const a = left.fieldDefinitionId ? definitionById.get(left.fieldDefinitionId) : undefined;
      const b = right.fieldDefinitionId ? definitionById.get(right.fieldDefinitionId) : undefined;
      const ag = a?.kind === "default" ? 0 : 1;
      const bg = b?.kind === "default" ? 0 : 1;
      return ag - bg || (a?.position ?? 9999) - (b?.position ?? 9999);
    });
  };

  const current = new Map(existingBefore.map((drug) => [drug.koreanName, drug]));
  for (const record of records) {
    const existing = current.get(record.koreanName);
    const originRecord = originByDrug.get(record.koreanName);
    const structuredOrigins = originRecord?.origins.map((origin) => ({ nameKo: origin.name_ko, scientificName: origin.scientific_name })) ?? existing?.origins ?? [];
    if (existing) {
      const origin = existing.scientificName && !(existing.origin ?? "").includes(existing.scientificName)
        ? [existing.origin, existing.scientificName].filter(Boolean).join(" · ")
        : existing.origin;
      await db.update(crudeDrugs).set({
        catalogIndex: record.catalogIndex,
        categoryId: categoryId.get(record.category)!,
        importance: record.importance as ImportanceLevel,
        ...(originRecord ? { latinName: originRecord.name_latin, origins: structuredOrigins } : {}),
        origin,
        sections: normalizeSections(existing.sections),
        updatedAt: new Date(),
      }).where(eq(crudeDrugs.id, existing.id));
    } else {
      await db.insert(crudeDrugs).values({
        catalogIndex: record.catalogIndex,
        koreanName: record.koreanName,
        categoryId: categoryId.get(record.category)!,
        importance: record.importance as ImportanceLevel,
        ...(originRecord ? { latinName: originRecord.name_latin, origins: structuredOrigins } : {}),
        sections: normalizeSections([]),
      });
    }
  }

  const names = records.map((record) => record.koreanName);
  await db.delete(crudeDrugs).where(notInArray(crudeDrugs.koreanName, names));
  await db.delete(categories).where(notInArray(categories.name, ["종자류", "과실류", "전초류"]));

  let [relationType] = await db.select().from(relationshipTypes).where(eq(relationshipTypes.name, "연관")).limit(1);
  if (!relationType) [relationType] = await db.insert(relationshipTypes).values({ name: "연관" }).returning();
  const scopedDrugs = await db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName }).from(crudeDrugs).where(inArray(crudeDrugs.koreanName, names));
  const drugId = new Map(scopedDrugs.map((drug) => [drug.name, drug.id]));
  for (const [leftName, rightName] of relationPairs) {
    const sourceId = drugId.get(leftName)!;
    const targetId = drugId.get(rightName)!;
    const [existing] = await db.select({ id: crudeDrugRelationships.id }).from(crudeDrugRelationships)
      .where(or(and(eq(crudeDrugRelationships.sourceId, sourceId), eq(crudeDrugRelationships.targetId, targetId)), and(eq(crudeDrugRelationships.sourceId, targetId), eq(crudeDrugRelationships.targetId, sourceId)))).limit(1);
    if (!existing) await db.insert(crudeDrugRelationships).values({ sourceId, targetId, typeId: relationType.id });
  }

  const finalRows = await db.select({ index: crudeDrugs.catalogIndex, name: crudeDrugs.koreanName }).from(crudeDrugs);
  const indexes = finalRows.map((row) => row.index).filter((value): value is number => value !== null);
  if (finalRows.length !== 97 || new Set(indexes).size !== 97 || Math.min(...indexes) !== 1 || Math.max(...indexes) !== 97) {
    throw new Error("Exam-scope migration validation failed.");
  }
  console.log(`Exam scope migrated: ${finalRows.length} drugs, ${relationPairs.length} in-scope relationships.`);
  await databaseClient.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
