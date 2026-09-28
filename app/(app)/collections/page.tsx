import { CollectionsManager } from "@/components/collections-manager";

export const dynamic = "force-dynamic";
export default function CollectionsPage() {
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Knowledge workspace</p><h1>Collections</h1><p className="subtitle">소스와 연결되는 자유로운 블록 문서로 학습 지식을 구성합니다.</p></div></header><CollectionsManager/></div>;
}
