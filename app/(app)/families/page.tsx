import { FamiliesManager } from "@/components/families-manager";
import { getFamilyExplorerData } from "@/lib/data/family";
import { Download } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FamiliesPage() {
  const families = await getFamilyExplorerData();
  return <div className="page families-page"><header className="page-header"><div><h1>Botanical Families</h1><p className="subtitle">과에서 분류와 생약으로 이어지는 계층을 탐색하고, 공통 학습 노트를 정리합니다.</p></div><Link className="button secondary families-xlsx-export" href="/api/export/families/xlsx" prefetch={false}><Download size={16}/> 전체 Excel</Link></header><FamiliesManager initialFamilies={families}/></div>;
}
