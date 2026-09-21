import { CardsManager } from "@/components/cards-manager";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, crudeDrugs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export default async function CardsPage() {
  const [drugRows, collectionRows] = await Promise.all([
    db.select({ id: crudeDrugs.id, name: crudeDrugs.koreanName }).from(crudeDrugs).orderBy(asc(crudeDrugs.koreanName)),
    db.select({ id: collections.id, name: collections.name }).from(collections).orderBy(asc(collections.name)),
  ]);
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Manual study cards</p><h1>Word Cards</h1><p className="subtitle">직접 만든 카드로 핵심 내용을 가볍게 복습합니다.</p></div></header><CardsManager drugs={drugRows} collections={collectionRows}/></div>;
}
