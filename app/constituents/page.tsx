import { ConstituentTreeManager } from "@/components/constituent-tree-manager";

export default function ConstituentsPage() {
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Biosynthetic knowledge base</p><h1>성분 체계</h1><p className="subtitle">생합성 경로부터 개별 성분까지 연결하고, 교차 분류를 한눈에 관리합니다.</p></div></header><ConstituentTreeManager/></div>;
}
