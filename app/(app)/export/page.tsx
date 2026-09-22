import { asc, eq } from "drizzle-orm";
import { DataCardExport } from "@/components/data-card-export";
import { db } from "@/lib/db";
import { categories, crudeDrugs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ExportPage({ searchParams }: { searchParams: Promise<{ drugId?: string }> }) {
  const [{ drugId }, drugs] = await Promise.all([
    searchParams,
    db.select({
      id: crudeDrugs.id,
      catalogIndex: crudeDrugs.catalogIndex,
      referenceIndex: crudeDrugs.referenceIndex,
      koreanName: crudeDrugs.koreanName,
      latinName: crudeDrugs.latinName,
      importance: crudeDrugs.importance,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryPosition: categories.position,
    }).from(crudeDrugs).leftJoin(categories, eq(crudeDrugs.categoryId, categories.id)).orderBy(asc(categories.position), asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)),
  ]);
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Study material</p><h1>Export</h1><p className="subtitle">선택한 Data Card를 DOCX 또는 PDF 학습 자료로 내보냅니다.</p></div></header><DataCardExport drugs={drugs} initialDrugId={drugId}/></div>;
}
