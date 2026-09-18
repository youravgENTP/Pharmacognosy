import { FamiliesManager } from "@/components/families-manager";
import { getFamilyExplorerData } from "@/lib/data/family";

export const dynamic = "force-dynamic";

export default async function FamiliesPage() {
  const families = await getFamilyExplorerData();
  return <div className="page families-page"><header className="page-header"><div><h1>Botanical Families</h1><p className="subtitle">과에서 분류와 생약으로 이어지는 계층을 탐색하고, 공통 학습 노트를 정리합니다.</p></div></header><FamiliesManager initialFamilies={families}/></div>;
}
