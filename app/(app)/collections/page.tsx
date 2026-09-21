import { asc } from "drizzle-orm";
import { CollectionsManager } from "@/components/collections-manager";
import { db } from "@/lib/db";
import { crudeDrugs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export default async function CollectionsPage() {
  const drugs = await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName }).from(crudeDrugs).orderBy(asc(crudeDrugs.koreanName));
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Knowledge workspace</p><h1>Collections</h1><p className="subtitle">소스와 연결되는 자유로운 블록 문서로 학습 지식을 구성합니다.</p></div></header><CollectionsManager drugs={drugs}/></div>;
}
