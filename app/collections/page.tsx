import { asc } from "drizzle-orm";
import { CollectionsManager } from "@/components/collections-manager";
import { db } from "@/lib/db";
import { crudeDrugs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export default async function CollectionsPage() {
  const drugs = await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName }).from(crudeDrugs).orderBy(asc(crudeDrugs.koreanName));
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Flexible classification</p><h1>Collections</h1><p className="subtitle">스키마 변경 없이, 원하는 기준으로 생약을 묶습니다.</p></div></header><CollectionsManager drugs={drugs}/></div>;
}

