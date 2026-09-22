"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { StudyContentEditor } from "@/components/study-content-editor";
import type { FieldInputMode, StudyBlock, StudyItem } from "@/lib/db/schema";

type MnemonicVersion = {
  id: string;
  userId: string;
  userName: string;
  items: StudyItem[];
  blocks: StudyBlock[];
  updatedAt: string;
  isMine: boolean;
};

type MnemonicContent = { items: StudyItem[]; blocks: StudyBlock[] };
const NEW_MINE = "__new_mine__";

export function DrugMnemonicVersions({ drugId, mode, onRemove }: { drugId: string; mode: FieldInputMode; onRemove: () => void }) {
  const [versions, setVersions] = useState<MnemonicVersion[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [content, setContent] = useState<MnemonicContent>({ items: [], blocks: [] });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const timer = useRef<number | undefined>(undefined);
  const revision = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/drugs/${drugId}/mnemonics`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("암기법을 불러오지 못했습니다.");
        return response.json() as Promise<{ currentUserId: string; preferredMnemonicUserId: string | null; versions: MnemonicVersion[] }>;
      })
      .then((result) => {
        const selected = result.versions.find((version) => version.userId === result.preferredMnemonicUserId) ?? result.versions.find((version) => version.isMine) ?? result.versions[0];
        setVersions(result.versions);
        setCurrentUserId(result.currentUserId);
        setSelectedUserId(selected?.userId ?? NEW_MINE);
        setContent(selected ? { items: selected.items, blocks: selected.blocks } : { items: [], blocks: [] });
        setStatus("saved");
        setLoading(false);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") { setStatus("error"); setLoading(false); }
      });
    return () => { controller.abort(); window.clearTimeout(timer.current); };
  }, [drugId]);

  const selected = versions.find((version) => version.userId === selectedUserId);
  const editable = selectedUserId === NEW_MINE || selected?.isMine === true;
  const labels = versionLabels(versions);

  function selectVersion(userId: string) {
    window.clearTimeout(timer.current);
    if (status === "dirty" && editable) void save(content, revision.current);
    setStatus("saved");
    if (userId === NEW_MINE) {
      setSelectedUserId(NEW_MINE);
      setContent({ items: [], blocks: [] });
      return;
    }
    const next = versions.find((version) => version.userId === userId);
    if (!next) return;
    setSelectedUserId(next.userId);
    setContent({ items: next.items, blocks: next.blocks });
    void fetch(`/api/drugs/${drugId}/mnemonic-preference`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredMnemonicUserId: next.userId }) });
  }

  function change(next: MnemonicContent) {
    if (!editable) return;
    setContent(next);
    setStatus("dirty");
    revision.current += 1;
    const expectedRevision = revision.current;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(next, expectedRevision), 700);
  }

  async function save(next: MnemonicContent, expectedRevision: number) {
    const savingSelection = selectedUserId;
    setStatus("saving");
    try {
      const response = await fetch(`/api/drugs/${drugId}/mnemonics/me`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error();
      const saved = await response.json() as MnemonicVersion;
      setVersions((current) => [saved, ...current.filter((version) => version.userId !== saved.userId)]);
      setSelectedUserId((current) => current === savingSelection ? saved.userId : current);
      if (savingSelection === NEW_MINE) void fetch(`/api/drugs/${drugId}/mnemonic-preference`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredMnemonicUserId: saved.userId }) });
      if (revision.current === expectedRevision) setStatus("saved");
    } catch { if (revision.current === expectedRevision) setStatus("error"); }
  }

  return <section className="profile-field mnemonic-field">
    <div className="profile-field-title mnemonic-title">
      <h2>암기법</h2>
      {!loading && versions.length ? <select className="mnemonic-version-select" aria-label="암기법 작성자" value={selectedUserId} onChange={(event) => selectVersion(event.target.value)}>
        {versions.map((version) => <option key={version.userId} value={version.userId}>{labels.get(version.userId)}</option>)}
        {!versions.some((version) => version.isMine) ? <option value={NEW_MINE}>+ 내 암기법 만들기</option> : null}
      </select> : null}
      {!loading && editable ? <span className={`mnemonic-save-status ${status}`}>{status === "saving" ? "저장 중…" : status === "error" ? "저장 실패" : status === "dirty" ? "변경됨" : "저장됨"}</span> : null}
      {!loading && !editable ? <span className="mnemonic-read-only">읽기 전용</span> : null}
      <button className="field-remove" onClick={onRemove} title="이 생약에서 필드 삭제" aria-label="암기법 삭제"><X size={21}/></button>
    </div>
    {loading ? <p className="mnemonic-loading">암기법을 불러오는 중…</p> : status === "error" && !currentUserId ? <p className="form-error">암기법을 불러오지 못했습니다.</p> : <StudyContentEditor key={selectedUserId} items={content.items} blocks={content.blocks} mode={mode} readOnly={!editable} onChange={change}/>}
  </section>;
}

function versionLabels(versions: MnemonicVersion[]) {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const version of versions) totals.set(version.userName, (totals.get(version.userName) ?? 0) + 1);
  for (const version of versions) {
    const index = (seen.get(version.userName) ?? 0) + 1;
    seen.set(version.userName, index);
    labels.set(version.userId, (totals.get(version.userName) ?? 0) > 1 && index > 1 ? `${version.userName} (${index})` : version.userName);
  }
  return labels;
}
