"use client";

import { Check, ChevronDown, ChevronRight, Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FieldInputMode, ImportanceLevel, OriginPlant, StudyItem, StudySection } from "@/lib/db/schema";
import { StudyContentEditor } from "@/components/study-content-editor";
import { DrugMnemonicVersions } from "@/components/drug-mnemonic-versions";
import { compareDrugIndexes, formatDrugIndex } from "@/lib/drug-index";
import { ConceptBoundary, conceptTargetAttributes, type ConceptTarget, useConceptEngine } from "@/components/concept-engine";
import { taxonomyIndent } from "@/lib/constituent-taxonomy";
import { appendStudyItem } from "@/lib/study-blocks";
import { useDataCardSaveGuard } from "@/components/data-card-save-guard";
import { DataCardMergeEditor, type DataCardMergeSession } from "@/components/data-card-merge-editor";
import { sameDataCard, type DataCardContent, type MergeResolutions } from "@/lib/data-card-merge";

type DrugDraft = DataCardContent & {
  koreanName: string; latinName: string | null; origin: string | null; origins: OriginPlant[]; scientificName: string | null;
  medicinalPart: string | null; familyId: string | null; importance: ImportanceLevel; sections: StudySection[];
};
type Taxon = { id: string; name: string; kind: string };
type TaxonEdge = { parentId: string; childId: string };
type FieldDefinition = { id: string; name: string; kind: "default" | "custom"; inputMode: FieldInputMode; position: number; active: boolean };
type RelationshipType = "연관생약" | "유사생약";
type DrugArchive = { prefix: string; name: string; originalIndexType?: "catalog" | "reference"; originalIndex: number } | null;
type RelatedDrug = { id: string; drugId: string; catalogIndex: number | null; referenceIndex: number | null; archive?: DrugArchive; name: string; latinName?: string | null };
type AvailableDrug = { id: string; catalogIndex: number | null; referenceIndex: number | null; archive?: DrugArchive; name: string; latinName?: string | null };
type OriginSuggestion = OriginPlant & { drugs: { id: string; name: string }[] };
type FamilySuggestion = { id: string; koreanName: string; scientificName: string; acceptedScientificName: string | null };
type IdentityTerm = { id: string; name: string };
type StoredDrugDraft = { serverRevision: number; draft: DrugDraft; baseDraft?: DrugDraft; updatedAt: string; sessionId?: string };
const importanceOptions: ImportanceLevel[] = ["중요", "중간", "비중요"];

type DrugEditorProps = { id: string; dataRevision: number; initial: DrugDraft; family: string | null; archive?: DrugArchive; catalogIndex?: number | null; referenceIndex?: number | null; identityTerms?: IdentityTerm[]; relatedDrugs?: RelatedDrug[]; similarDrugs?: RelatedDrug[]; availableDrugs?: AvailableDrug[]; modal?: boolean; admin?: boolean };
export function DrugEditor(props: DrugEditorProps) { return <ConceptBoundary ownerType="drug" ownerId={props.id}><DrugEditorContent {...props}/></ConceptBoundary>; }
function DrugEditorContent({ id, dataRevision, initial, family, archive, catalogIndex = null, referenceIndex = null, identityTerms: initialIdentityTerms = [], relatedDrugs: initialRelatedDrugs = [], similarDrugs: initialSimilarDrugs = [], availableDrugs: initialAvailableDrugs = [], modal = false }: DrugEditorProps) {
  const router = useRouter();
  const concepts = useConceptEngine();
  const { state: closeState, error: closeError, closePending, isClosePending, setBlocked, setState: setCloseState, registerCloseController, requestClose, cancelPendingClose, resumePendingClose } = useDataCardSaveGuard();
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<"dirty" | "saving" | "saved" | "error">("saved");
  const [mnemonicStatus, setMnemonicStatus] = useState<"dirty" | "saving" | "saved" | "error">("saved");
  const [manualSavePending, setManualSavePending] = useState(false);
  const [relationshipPending, setRelationshipPending] = useState(0);
  const [identityPending, setIdentityPending] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [backupState, setBackupState] = useState<"pending" | "backed-up" | "failed">();
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [constituentData, setConstituentData] = useState<{ nodes: Taxon[]; edges: TaxonEdge[] }>({ nodes: [], edges: [] });
  const [identitySuggestions, setIdentitySuggestions] = useState<{ origins: OriginSuggestion[]; families: FamilySuggestion[] }>({ origins: [], families: [] });
  const [pickerSectionId, setPickerSectionId] = useState<string>();
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [relationshipPicker, setRelationshipPicker] = useState<RelationshipType>();
  const [relatedDrugs, setRelatedDrugs] = useState(initialRelatedDrugs);
  const [similarDrugs, setSimilarDrugs] = useState(initialSimilarDrugs);
  const [availableDrugs, setAvailableDrugs] = useState(initialAvailableDrugs);
  const [identityTerms, setIdentityTerms] = useState(initialIdentityTerms);
  const [mergeSession, setMergeSession] = useState<DataCardMergeSession>();
  const [mergeVisible, setMergeVisible] = useState(false);
  const [mergeResolutions, setMergeResolutions] = useState<MergeResolutions>({});
  const [mergeSaving, setMergeSaving] = useState(false);
  const first = useRef(true);
  const draftRef = useRef(draft);
  const revision = useRef(0);
  const serverRevision = useRef(dataRevision);
  const baseDraft = useRef<DrugDraft>(structuredClone(initial));
  const conflictActive = useRef(false);
  const applyingMerge = useRef(false);
  const guardKey = `${id}:${useId()}`;
  const savedDraftRevision = useRef(0);
  const contentHash = useRef<string | undefined>(undefined);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const recoveredSessionId = useRef<string | undefined>(undefined);
  const sessionReady = useRef<Promise<unknown>>(Promise.resolve());
  const sessionClosed = useRef(false);
  const stopHeartbeat = useRef<() => void>(() => undefined);
  const resumeHeartbeat = useRef<() => void>(() => undefined);
  const relationshipPendingRef = useRef(0);
  const identityPendingRef = useRef(false);
  const auxiliaryError = useRef<string | undefined>(undefined);
  const relationshipIdsRef = useRef<string[]>([]);
  const identityTermIdsRef = useRef<string[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const manualSaving = useRef(false);
  const mnemonicManualSave = useRef<(() => Promise<boolean>) | null>(null);
  const hadUnsavedChanges = useRef(false);
  draftRef.current = draft;
  relationshipPendingRef.current = relationshipPending;
  identityPendingRef.current = identityPending;
  relationshipIdsRef.current = [...relatedDrugs, ...similarDrugs].map((item) => item.id).sort();
  identityTermIdsRef.current = identityTerms.map((item) => item.id).sort();
  const leaveBlocked = status !== "saved" || mnemonicStatus !== "saved" || manualSavePending || relationshipPending > 0 || identityPending;
  const recoveryKey = `herboverflow:data-card-draft:${id}`;
  const clearRecovery = () => { try { window.localStorage.removeItem(recoveryKey); } catch { /* Browser storage must not affect DB save status. */ } };
  const storeRecovery = (value: DrugDraft, baseRevision = serverRevision.current) => { try { window.localStorage.setItem(recoveryKey, JSON.stringify({ serverRevision: baseRevision, draft: value, baseDraft: baseDraft.current, updatedAt: new Date().toISOString(), sessionId: sessionIdRef.current } satisfies StoredDrugDraft)); } catch { /* Browser storage must not affect DB save status. */ } };

  async function beginConflict(local: DrugDraft, requestedBaseRevision = serverRevision.current, fallbackBase = baseDraft.current) {
    conflictActive.current = true;
    window.clearTimeout(timer.current);
    storeRecovery(local, requestedBaseRevision);
    setCloseState("conflict", "Local 초안이 보존되었습니다. 충돌 항목을 해결하고 서버 저장 검증을 완료해야 닫을 수 있습니다.");
    try {
      const response = await fetch(`/api/drugs/${id}/revisions?baseRevision=${requestedBaseRevision}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !isDrugDraft(body.remote)) throw new Error();
      const serverBase = isDrugDraft(body.base) ? body.base : fallbackBase;
      setMergeSession({ baseRevision: requestedBaseRevision, remoteRevision: body.currentRevision, base: structuredClone(serverBase), local: structuredClone(local), remote: structuredClone(body.remote), baseAvailable: Boolean(body.baseAvailable) });
      setMergeVisible(!isClosePending());
    } catch {
      setStatus("error");
      setCloseState("conflict", "Remote 데이터를 불러오지 못했습니다. Local 초안은 브라우저에 보존되어 있습니다. 다시 저장을 눌러 재시도하세요.");
    }
  }

  function persist(value = draftRef.current, expectedRevision = revision.current, verify = false) {
    const snapshot = structuredClone(value);
    const run = async () => {
      if (conflictActive.current) { storeRecovery(draftRef.current); setMergeSession((current) => current ? { ...current, local: structuredClone(draftRef.current) } : current); return false; }
      setStatus("saving");
      let conflict = false;
      try {
        const response = await fetch(`/api/drugs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Request-Id": crypto.randomUUID(), ...(sessionIdRef.current ? { "X-Editing-Session-Id": sessionIdRef.current } : {}) }, body: JSON.stringify({ ...snapshot, baseRevision: serverRevision.current }) });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (response.status === 409 && body.code === "REVISION_CONFLICT") { conflict = true; await beginConflict(draftRef.current); }
          throw new Error();
        }
        const body = await response.json();
        if (verify) {
          const verification = await fetch(`/api/drugs/${id}/revisions?baseRevision=${body.dataRevision}`, { cache: "no-store" });
          const verified = await verification.json().catch(() => ({}));
          if (!verification.ok || verified.currentRevision !== body.dataRevision || !isDrugDraft(verified.remote) || !sameDataCard(snapshot, verified.remote)) throw new Error("서버 저장 내용 검증에 실패했습니다.");
        }
        if (typeof body.dataRevision === "number") { serverRevision.current = body.dataRevision; baseDraft.current = structuredClone(snapshot); contentHash.current = typeof body.contentHash === "string" ? body.contentHash : undefined; setBackupState("pending"); }
        savedDraftRevision.current = Math.max(savedDraftRevision.current, expectedRevision);
        if (revision.current === expectedRevision) { setStatus("saved"); setCloseState("idle"); storeRecovery(snapshot, serverRevision.current); }
        return true;
      } catch { if (revision.current === expectedRevision) setStatus("error"); if (!conflict) setCloseState("failed", "Data Card 저장에 실패했습니다. 입력 내용은 브라우저 복구 초안에 유지됩니다."); return false; }
    };
    const queued = saveQueue.current.then(run, run);
    saveQueue.current = queued;
    return queued;
  }
  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(recoveryKey) ?? "null") as StoredDrugDraft | null;
      if (!parsed || typeof parsed.serverRevision !== "number" || !isDrugDraft(parsed.draft)) return;
      if (window.confirm("이 브라우저에 정상 종료 검증이 끝나지 않은 Data Card 편집 내용이 남아 있습니다. 복구할까요?")) {
        // Keep the original base revision. If another device saved meanwhile,
        // recovery stays visible while optimistic concurrency blocks overwrite.
        serverRevision.current = parsed.serverRevision;
        baseDraft.current = parsed.baseDraft && isDrugDraft(parsed.baseDraft) ? parsed.baseDraft : structuredClone(initial);
        recoveredSessionId.current = parsed.sessionId;
        setDraft(parsed.draft);
      }
    } catch { clearRecovery(); }
  // Recovery is scoped to this card and intentionally runs only on entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (applyingMerge.current) { applyingMerge.current = false; return; }
    revision.current += 1;
    const expectedRevision = revision.current;
    setStatus("dirty");
    if (conflictActive.current) {
      setCloseState("conflict", "Local 초안이 보존되었습니다. 충돌 해결과 서버 검증 전에는 닫을 수 없습니다.");
      storeRecovery(draft);
      setMergeSession((current) => current ? { ...current, local: structuredClone(draft) } : current);
      return;
    }
    setCloseState("dirty");
    storeRecovery(draft);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(draft, expectedRevision), 700);
    return () => window.clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, id]);
  useEffect(() => {
    if (backupState !== "pending") return;
    const check = async () => { try { const response = await fetch(`/api/drugs/${id}/backup-status`, { cache: "no-store" }); if (!response.ok) return; const body = await response.json(); if (body.status === "ready" && body.revision === serverRevision.current) setBackupState("backed-up"); else if (body.status === "failed") setBackupState("failed"); } catch { /* backup state must never affect autosave */ } };
    void check(); const poll = window.setInterval(() => void check(), 10_000); return () => window.clearInterval(poll);
  }, [backupState, id]);
  useEffect(() => {
    Promise.all([fetch("/api/constituent-taxa").then((response) => response.json()), fetch("/api/field-definitions").then((response) => response.json()), fetch("/api/identity-suggestions").then((response) => response.json())])
      .then(([taxa, fields, suggestions]) => { setConstituentData({ nodes: taxa.nodes ?? [], edges: taxa.edges ?? [] }); setFieldDefinitions(fields ?? []); setIdentitySuggestions({ origins: suggestions.origins ?? [], families: suggestions.families ?? [] }); })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const sessionId = recoveredSessionId.current ?? crypto.randomUUID();
    let heartbeat: number | undefined;
    sessionIdRef.current = sessionId;
    const signal = (action: "open" | "heartbeat") => fetch(`/api/drugs/${id}/editing-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, action }) });
    const open = () => {
      if (sessionClosed.current || heartbeat != null) return;
      sessionReady.current = signal("open");
      heartbeat = window.setInterval(() => void signal("heartbeat"), 20_000);
    };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) open(); };
    const pageHide = () => { window.clearInterval(heartbeat); heartbeat = undefined; };
    stopHeartbeat.current = pageHide; resumeHeartbeat.current = open;
    open();
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => { window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", pageShow); window.clearInterval(heartbeat); };
  }, [id]);
  useEffect(() => {
    registerCloseController(guardKey, { reopenAfterFailedBatch: () => { sessionClosed.current = false; resumeHeartbeat.current(); }, openConflictResolver: () => setMergeVisible(true), closeAndVerify: async () => {
      if (conflictActive.current) return { ok: false, conflict: true, error: "서버에 다른 변경사항이 저장되어 있습니다. 충돌을 해결한 뒤 다시 닫을 수 있습니다." };
      for (let pass = 0; pass < 6; pass++) {
        const expectedDraftRevision = revision.current;
        setCloseState("saving");
        window.clearTimeout(timer.current);
        const cardSaved = savedDraftRevision.current >= expectedDraftRevision && contentHash.current ? await saveQueue.current : await persist(draftRef.current, expectedDraftRevision);
        if (!cardSaved) return { ok: false, conflict: conflictActive.current, error: conflictActive.current ? "서버에 다른 변경사항이 저장되어 있습니다." : "Data Card 본문과 Study Section을 저장하지 못했습니다. 입력 내용은 브라우저 초안에 유지됩니다." };
        const mnemonicSaved = await (mnemonicManualSave.current?.() ?? Promise.resolve(true));
        if (!mnemonicSaved) return { ok: false, error: "암기법을 저장하지 못했습니다. 암기법 입력 내용은 그대로 유지됩니다." };
        if (!await waitUntil(() => relationshipPendingRef.current === 0 && !identityPendingRef.current, 20_000)) {
          if (relationshipPendingRef.current > 0) return { ok: false, error: "연관생약 또는 유사생약 저장이 아직 완료되지 않았습니다." };
          return { ok: false, error: "Identification Field 저장이 아직 완료되지 않았습니다." };
        }
        if (auxiliaryError.current) return { ok: false, error: auxiliaryError.current };
        if (revision.current !== expectedDraftRevision) continue;
        const sessionId = sessionIdRef.current; const hash = contentHash.current;
        if (!sessionId || !hash) return { ok: false, error: "서버 저장 검증 정보를 만들지 못했습니다." };
        setCloseState("verifying");
        try { await sessionReady.current; } catch { return { ok: false, error: "편집 세션을 서버에서 확인하지 못했습니다." }; }
        setCloseState("closing"); stopHeartbeat.current();
        let response: Response;
        try { response = await fetch(`/api/drugs/${id}/editing-session`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, revision: serverRevision.current, contentHash: hash, content: draftRef.current, relationshipIds: relationshipIdsRef.current, identityTermIds: identityTermIdsRef.current }) }); }
        catch { resumeHeartbeat.current(); return { ok: false, error: "편집 세션 종료 확인 중 네트워크 오류가 발생했습니다." }; }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { resumeHeartbeat.current(); return { ok: false, conflict: response.status === 409, error: result.error ?? "서버 저장 검증에 실패했습니다." }; }
        if (revision.current !== expectedDraftRevision) {
          sessionClosed.current = false;
          resumeHeartbeat.current();
          continue;
        }
        sessionClosed.current = true; clearRecovery(); setCloseState("idle"); return { ok: true };
      }
      return { ok: false, error: "종료 검증 중 새 변경이 계속 발생했습니다. 입력을 잠시 멈춘 뒤 다시 시도해 주세요." };
    } });
    return () => registerCloseController(guardKey, null);
  // The controller reads mutable refs so every pass observes the newest draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardKey, id, registerCloseController, setCloseState]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "s") return;
      event.preventDefault();
      if (!event.repeat) void manualSave();
    };
    window.addEventListener("keydown", listener, { capture: true });
    return () => window.removeEventListener("keydown", listener, { capture: true });
  // manualSave reads mutable refs so the shortcut always saves the newest editor state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    setBlocked(leaveBlocked);
    return () => setBlocked(false);
  }, [leaveBlocked, setBlocked]);
  useEffect(() => {
    if (leaveBlocked) {
      hadUnsavedChanges.current = true;
      setShowSaved(false);
      return;
    }
    if (!hadUnsavedChanges.current) return;
    hadUnsavedChanges.current = false;
    setShowSaved(true);
    const hide = window.setTimeout(() => setShowSaved(false), 1600);
    return () => window.clearTimeout(hide);
  }, [leaveBlocked]);

  const setField = <K extends keyof DrugDraft>(key: K, value: DrugDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  function fieldName(section: StudySection) { return fieldDefinitions.find((field) => field.id === section.fieldDefinitionId)?.name ?? section.title; }
  function updateSection(sectionId: string, patch: Partial<StudySection>) { setField("sections", draft.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section)); }
  async function removeSection(sectionId: string) { if (!window.confirm("이 생약에서 이 필드와 내용을 삭제할까요?")) return; if (await concepts?.breakAnchors({ ownerId: id, sectionIds: [sectionId] }) === false) return; setField("sections", draft.sections.filter((section) => section.id !== sectionId)); }
  async function applyDefinitions(selectedIds: string[]) {
    const selected = new Set(selectedIds);
    const removed = draft.sections.filter((section) => section.fieldDefinitionId && !selected.has(section.fieldDefinitionId));
    if (removed.some((section) => hasContent(section.items)) && !window.confirm("내용이 입력된 Field가 포함되어 있습니다. 이 생약에서 해당 Field와 내용을 삭제할까요?")) return;
    if (removed.length && await concepts?.breakAnchors({ ownerId: id, sectionIds: removed.map((section) => section.id) }) === false) return;
    const retained = draft.sections.filter((section) => !section.fieldDefinitionId || selected.has(section.fieldDefinitionId));
    const existing = new Set(retained.map((section) => section.fieldDefinitionId).filter(Boolean));
    const additions = fieldDefinitions.filter((field) => selected.has(field.id) && !existing.has(field.id)).map((field) => ({ id: crypto.randomUUID(), fieldDefinitionId: field.id, title: field.name, items: [] }));
    setField("sections", sortSections([...retained, ...additions], fieldDefinitions));
    setFieldPickerOpen(false);
  }
  async function addRelationship(targetId: string, type: RelationshipType, supplied?: AvailableDrug) {
    const target = supplied ?? availableDrugs.find((drug) => drug.id === targetId);
    if (!target) return;
    setRelationshipPending((current) => current + 1);
    try {
      const response = await fetch(`/api/drugs/${id}/relationships`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, type }) });
      if (!response.ok) { const body = await response.json(); const message = body.error ?? "관계 저장에 실패했습니다."; auxiliaryError.current = message; window.alert(message); return; }
      const created = await response.json();
      auxiliaryError.current = undefined;
      const setter = type === "연관생약" ? setRelatedDrugs : setSimilarDrugs;
      setter((current) => [...current, { id: created.id, drugId: target.id, catalogIndex: target.catalogIndex, referenceIndex: target.referenceIndex, archive: target.archive, name: target.name, latinName: target.latinName }]);
      setAvailableDrugs((current) => current.filter((drug) => drug.id !== targetId));
      setRelationshipPicker(undefined);
    } catch { auxiliaryError.current = "관계 저장 중 네트워크 오류가 발생했습니다."; } finally { setRelationshipPending((current) => Math.max(0, current - 1)); }
  }
  async function createAndRelate(name: string, type: RelationshipType) {
    setRelationshipPending((current) => current + 1);
    try {
      const response = await fetch("/api/reference-drugs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ koreanName: name }) });
      const created = await response.json(); if (!response.ok) { auxiliaryError.current = created.error ?? "참고 생약을 만들지 못했습니다."; window.alert(auxiliaryError.current); return; }
      await addRelationship(created.id, type, { id: created.id, catalogIndex: created.catalogIndex, referenceIndex: created.referenceIndex, name: created.koreanName, latinName: created.latinName });
    } finally { setRelationshipPending((current) => Math.max(0, current - 1)); }
  }
  async function removeRelated(relationshipId: string, type: RelationshipType) {
    const list = type === "연관생약" ? relatedDrugs : similarDrugs; const related = list.find((item) => item.id === relationshipId);
    if (await concepts?.breakTarget({ ownerType: "drug", ownerId: id, targetType: "drug_identifier", targetRef: { key: type, relationId: relationshipId } }) === false) return;
    setRelationshipPending((current) => current + 1);
    try {
      const response = await fetch(`/api/drugs/${id}/relationships`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationshipId }) });
      if (!response.ok) { const message = "관계 해제 저장에 실패했습니다."; auxiliaryError.current = message; window.alert(message); return; }
      auxiliaryError.current = undefined;
      const setter = type === "연관생약" ? setRelatedDrugs : setSimilarDrugs; setter((current) => current.filter((item) => item.id !== relationshipId));
      if (related) setAvailableDrugs((current) => [...current, { id: related.drugId, catalogIndex: related.catalogIndex, referenceIndex: related.referenceIndex, archive: related.archive, name: related.name, latinName: related.latinName }].sort(sortDrug));
    } catch { auxiliaryError.current = "관계 해제 중 네트워크 오류가 발생했습니다."; } finally { setRelationshipPending((current) => Math.max(0, current - 1)); }
  }
  function chooseConstituent(taxon: Taxon) {
    if (!pickerSectionId) return;
    const section = draft.sections.find((item) => item.id === pickerSectionId);
    if (section) updateSection(section.id, appendItem(section, { ...newItem(), text: taxon.name, linkedConstituentId: taxon.id }));
    setPickerSectionId(undefined);
  }
  function saveNow() { window.clearTimeout(timer.current); if (conflictActive.current) { if (mergeSession) { setMergeSession({ ...mergeSession, local: structuredClone(draftRef.current) }); setMergeVisible(true); } else void beginConflict(draftRef.current); return; } void persist(draftRef.current, revision.current, true); }
  async function saveMerged(value: DataCardContent) {
    if (!mergeSession || mergeSaving) return;
    setMergeSaving(true);
    storeRecovery(value as DrugDraft, mergeSession.remoteRevision);
    try {
      const response = await fetch(`/api/drugs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Request-Id": crypto.randomUUID(), ...(sessionIdRef.current ? { "X-Editing-Session-Id": sessionIdRef.current } : {}) }, body: JSON.stringify({ ...value, baseRevision: mergeSession.remoteRevision }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && body.code === "REVISION_CONFLICT") {
        await beginConflict(value as DrugDraft, mergeSession.remoteRevision, mergeSession.remote);
        return;
      }
      if (!response.ok || typeof body.dataRevision !== "number" || typeof body.contentHash !== "string") throw new Error("병합 저장에 실패했습니다.");
      const verification = await fetch(`/api/drugs/${id}/revisions?baseRevision=${body.dataRevision}`, { cache: "no-store" });
      const verified = await verification.json();
      if (!verification.ok || verified.currentRevision !== body.dataRevision || !isDrugDraft(verified.remote) || !sameDataCard(value, verified.remote)) throw new Error("서버 저장 내용 검증에 실패했습니다.");
      applyingMerge.current = true;
      setDraft(structuredClone(value) as DrugDraft);
      baseDraft.current = structuredClone(value) as DrugDraft;
      serverRevision.current = body.dataRevision;
      contentHash.current = body.contentHash;
      savedDraftRevision.current = revision.current;
      conflictActive.current = false;
      setMergeSession(undefined); setMergeVisible(false); setMergeResolutions({}); setStatus("saved"); setCloseState("idle"); setBackupState("pending");
      storeRecovery(value as DrugDraft, body.dataRevision);
      if (closePending) void resumePendingClose();
    } catch (error) {
      setStatus("error");
      setCloseState("conflict", error instanceof Error ? error.message : "병합 저장 및 검증에 실패했습니다. Local 초안은 유지됩니다.");
    } finally { setMergeSaving(false); }
  }
  async function manualSave() {
    if (manualSaving.current) return;
    manualSaving.current = true;
    setManualSavePending(true);
    window.clearTimeout(timer.current);
    try {
      const expectedRevision = revision.current;
      const cardSaved = await persist(draftRef.current, expectedRevision, true);
      if (!cardSaved) return;
      await (mnemonicManualSave.current?.() ?? Promise.resolve(true));
    } catch {
      setCloseState("failed", "수동 저장을 완료하지 못했습니다. 입력 내용은 유지됩니다.");
    } finally {
      manualSaving.current = false;
      setManualSavePending(false);
    }
  }
  async function openExport() {
    await requestClose(() => router.push(`/export?drugId=${encodeURIComponent(id)}`));
  }
  const closeInProgress = closeState === "saving" || closeState === "verifying" || closeState === "closing";
  return <div className={`drug-profile ${modal ? "in-modal" : "standalone"} ${closeInProgress ? "close-in-progress" : ""}`} aria-busy={closeInProgress}>
    {mergeSession && mergeVisible ? <DataCardMergeEditor session={mergeSession} resolutions={mergeResolutions} saving={mergeSaving} indexLabel={formatDrugIndex(catalogIndex, referenceIndex, archive)} onResolutionsChange={setMergeResolutions} onCancel={() => { setMergeVisible(false); if (closePending) cancelPendingClose(); }} onSave={(value) => void saveMerged(value)}/> : null}
    {showSaved ? <div className="data-card-saved-toast" role="status" aria-live="polite"><Check size={14}/> Saved!</div> : null}
    {closeError ? <p className="form-error" role="alert">{closeError}</p> : null}
    <section className="profile-identity indicator-field">
      {archive ? <div className="data-card-archive-indicator">{formatDrugIndex(null, null, archive)} · {archive.name}</div> : null}
      <div className="profile-name-row">
        <div className="profile-name-fields"><AnchorableInput className="profile-korean-name" value={draft.koreanName} onChange={(value) => setField("koreanName", value)} target={{ ownerType: "drug", ownerId: id, targetType: "drug_identifier", targetRef: { key: "koreanName" } }} aria-label="생약명"/><AnchorableInput className="profile-latin-name" value={draft.latinName ?? ""} onChange={(value) => setField("latinName", value)} target={{ ownerType: "drug", ownerId: id, targetType: "drug_identifier", targetRef: { key: "latinName" } }} placeholder="Latin name" aria-label="Latin name"/></div>
        <div className="profile-controls"><button className="data-card-export" onClick={() => void openExport()}><Download size={14}/> Export</button><label className={`importance-control importance-${importanceClass(draft.importance)}`}><span className="importance-dot" aria-hidden="true"/><select className="importance-select" aria-label="중요도" value={draft.importance} onChange={(event) => setField("importance", event.target.value as ImportanceLevel)}>{importanceOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><span className={`data-card-backup-state ${backupState ?? "unknown"}`}>{backupState === "backed-up" ? "백업 완료" : backupState === "failed" ? "백업 실패" : backupState === "pending" ? "백업 대기" : ""}</span><button className={`save-status ${status}`} onClick={saveNow} disabled={status === "saved"}><span className="dot"/>{closeState === "verifying" ? "저장 검증 중" : closeState === "conflict" ? "충돌 발생" : status === "saving" ? "저장 중" : status === "saved" ? "저장 완료" : status === "error" ? "저장 실패" : "변경사항 있음"}</button></div>
      </div>
      <div className="identity-lines">
        <IndicatorLine label="기원"><OriginEditor drugId={id} origins={draft.origins} legacyOrigin={draft.origin} suggestions={identitySuggestions.origins} onChange={(origins) => setField("origins", origins)}/></IndicatorLine>
        <IndicatorLine label="과"><FamilyEditor drugId={id} initialLabel={family} familyId={draft.familyId} suggestions={identitySuggestions.families} onChange={(familyId) => setField("familyId", familyId)}/></IndicatorLine>
        <IndicatorLine label="연관생약"><RelationshipList drugId={id} items={relatedDrugs} type="연관생약" onRemove={removeRelated} onAdd={() => setRelationshipPicker("연관생약")}/></IndicatorLine>
        <IndicatorLine label="유사생약"><RelationshipList drugId={id} items={similarDrugs} type="유사생약" onRemove={removeRelated} onAdd={() => setRelationshipPicker("유사생약")}/></IndicatorLine>
        <IndicatorLine label="가공 및 기타 사항"><IdentityTermsEditor drugId={id} terms={identityTerms} onChange={setIdentityTerms} onBusyChange={setIdentityPending} onErrorChange={(error) => { auxiliaryError.current = error; }}/></IndicatorLine>
      </div>
    </section>
    <div className="profile-sections">{draft.sections.map((section) => {
      const name = fieldName(section);
      const inputMode = fieldDefinitions.find((field) => field.id === section.fieldDefinitionId)?.inputMode ?? "hierarchy4";
      if (name === "암기법") return <DrugMnemonicVersions key={section.id} drugId={id} manualSaveRef={mnemonicManualSave} onSaveStatusChange={setMnemonicStatus} onRemove={() => void removeSection(section.id)}/>;
      return <section className="profile-field" key={section.id}>
        <div className="profile-field-title"><h2>{name}</h2><button className="field-remove" onClick={() => void removeSection(section.id)} title="이 생약에서 필드 삭제" aria-label={`${name} 삭제`}><X size={21}/></button></div>
        <StudyContentEditor items={section.items} blocks={section.blocks} mode={inputMode} taxonomy={name === "성분" ? constituentData : undefined} concept={{ ownerType: "drug", ownerId: id, sectionId: section.id }} onChange={(value) => updateSection(section.id, value)}/>
        {name === "성분" ? <div className="field-add-actions constituent-actions"><button className="add-line" onClick={() => updateSection(section.id, appendItem(section, newItem()))}><Plus size={14}/> 새 항목 추가</button><button className="taxonomy-picker-button" onClick={() => setPickerSectionId(section.id)}><Plus size={14}/> Compound Tree에서 추가</button></div> : null}
      </section>;
    })}</div>
    <div className="add-field-row"><button onClick={() => setFieldPickerOpen(true)}><Pencil size={15}/> Field 수정</button></div>
    {pickerSectionId ? <ConstituentPicker nodes={constituentData.nodes} edges={constituentData.edges} onChoose={chooseConstituent} onClose={() => setPickerSectionId(undefined)}/> : null}
    {relationshipPicker ? <RelatedDrugPicker type={relationshipPicker} drugs={availableDrugs} onChoose={(targetId) => addRelationship(targetId, relationshipPicker)} onCreate={(name) => createAndRelate(name, relationshipPicker)} onClose={() => setRelationshipPicker(undefined)}/> : null}
    {fieldPickerOpen ? <FieldPicker definitions={fieldDefinitions} sections={draft.sections} onDefinitionsChange={setFieldDefinitions} onSave={applyDefinitions} onClose={() => setFieldPickerOpen(false)}/> : null}
  </div>;
}

function IndicatorLine({ label, children }: { label: string; children: React.ReactNode }) { return <div className="identity-line indicator-line"><strong>{label}</strong><span className="identity-colon">:</span>{children}</div>; }
function IdentityTermsEditor({ drugId, terms, onChange, onBusyChange, onErrorChange }: { drugId: string; terms: IdentityTerm[]; onChange: (terms: IdentityTerm[]) => void; onBusyChange?: (busy: boolean) => void; onErrorChange?: (error?: string) => void }) {
  const [adding, setAdding] = useState(false); const [query, setQuery] = useState(""); const [suggestions, setSuggestions] = useState<IdentityTerm[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { if (!adding) return; const controller = new AbortController(); const timer = window.setTimeout(() => fetch(`/api/identity-terms?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then((response) => response.json()).then((rows: IdentityTerm[]) => setSuggestions(rows.filter((row) => !terms.some((term) => term.id === row.id)))).catch(() => undefined), 140); return () => { controller.abort(); window.clearTimeout(timer); }; }, [adding, query, terms]);
  async function attach(term: IdentityTerm) { if (terms.some((item) => item.id === term.id)) return; setBusy(true); try { const response = await fetch(`/api/drugs/${drugId}/identity-terms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ termId: term.id }) }); if (!response.ok) { onErrorChange?.("식별 용어 저장에 실패했습니다."); return window.alert("용어를 추가하지 못했습니다."); } onErrorChange?.(); onChange([...terms, term]); setQuery(""); setAdding(false); } catch { onErrorChange?.("식별 용어 저장 중 네트워크 오류가 발생했습니다."); } finally { setBusy(false); } }
  async function createAndAttach() { const name = query.trim(); if (!name || busy) return; const exact = suggestions.find((term) => term.name.toLocaleLowerCase() === name.toLocaleLowerCase()); if (exact) return attach(exact); setBusy(true); const response = await fetch("/api/identity-terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const term = await response.json(); setBusy(false); if (!response.ok) return window.alert(term.error ?? "용어를 만들지 못했습니다."); await attach(term); }
  async function remove(term: IdentityTerm) { setBusy(true); try { const response = await fetch(`/api/drugs/${drugId}/identity-terms/${term.id}`, { method: "DELETE" }); if (!response.ok) { onErrorChange?.("식별 용어 삭제 저장에 실패했습니다."); return; } onErrorChange?.(); onChange(terms.filter((item) => item.id !== term.id)); } catch { onErrorChange?.("식별 용어 삭제 중 네트워크 오류가 발생했습니다."); } finally { setBusy(false); } }
  return <div className="identity-term-editor"><div className="identity-term-chips">{terms.map((term) => <span key={term.id}>{term.name}<button onClick={() => void remove(term)} aria-label={`${term.name} 제거`}><X size={12}/></button></span>)}<button className="inline-add" onClick={() => setAdding((value) => !value)}><Plus size={14}/> 추가</button></div>{adding ? <div className="identity-term-combobox"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createAndAttach(); } if (event.key === "Escape") setAdding(false); }} placeholder="등록된 용어 검색 또는 새 용어 입력" autoFocus disabled={busy}/>{suggestions.length ? <div>{suggestions.map((term) => <button key={term.id} onMouseDown={(event) => event.preventDefault()} onClick={() => void attach(term)}>{term.name}</button>)}</div> : query.trim() ? <small>Enter로 “{query.trim()}” 만들기</small> : null}</div> : null}</div>;
}
function RelationshipList({ drugId, items, type, onRemove, onAdd }: { drugId: string; items: RelatedDrug[]; type: RelationshipType; onRemove: (id: string, type: RelationshipType) => void; onAdd: () => void }) {
  const concepts = useConceptEngine();
  return <div className="related-editor relationship-list">{[...items].sort(sortDrug).map((related, index) => { const target: ConceptTarget = { ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: type, relationId: related.id } }; return <span className="relationship-item" key={related.id}><b>{circledNumber(index + 1)}</b><Link {...conceptTargetAttributes(target)} onContextMenu={(event) => concepts?.openMenu(event, target)} href={`/drugs/${related.drugId}`} scroll={false}>({formatDrugIndex(related.catalogIndex, related.referenceIndex, related.archive)}, {related.name})</Link><button onClick={() => onRemove(related.id, type)} aria-label={`${related.name} 연결 해제`}><X size={13}/></button></span>; })}<button className="inline-add" onClick={onAdd}><Plus size={14}/> 연결</button></div>;
}
function circledNumber(value: number) { return value <= 20 ? String.fromCodePoint(0x2460 + value - 1) : `(${value})`; }
function OriginEditor({ drugId, origins, legacyOrigin, suggestions, onChange }: { drugId: string; origins: OriginPlant[]; legacyOrigin: string | null; suggestions: OriginSuggestion[]; onChange: (value: OriginPlant[]) => void }) {
  const rows = origins.length ? origins : [{ nameKo: legacyOrigin ?? "", scientificName: null }];
  function update(index: number, patch: Partial<OriginPlant>) { onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)); }
  function remove(index: number) { onChange(rows.filter((_, rowIndex) => rowIndex !== index)); }
  return <div className="origin-editor">{rows.map((origin, index) => <OriginRow drugId={drugId} index={index} key={index} origin={origin} suggestions={suggestions} onChange={(patch) => update(index, patch)} onRemove={() => remove(index)}/>)}<button className="origin-add" onClick={() => onChange([...rows, { nameKo: null, scientificName: null }])}><Plus size={13}/> 기원식물 추가</button></div>;
}

function OriginRow({ drugId, index, origin, suggestions, onChange, onRemove }: { drugId: string; index: number; origin: OriginPlant; suggestions: OriginSuggestion[]; onChange: (patch: Partial<OriginPlant>) => void; onRemove: () => void }) {
  const [focused, setFocused] = useState<"ko" | "scientific">();
  const needle = (focused === "scientific" ? origin.scientificName : origin.nameKo)?.trim().toLocaleLowerCase() ?? "";
  const matches = needle ? suggestions.filter((item) => [item.nameKo, item.scientificName, ...item.drugs.map((drug) => drug.name)].some((value) => value?.toLocaleLowerCase().includes(needle))).slice(0, 8) : [];
  const concepts = useConceptEngine();
  async function removeRow() { const targets: ConceptTarget[] = [{ ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: "originName", originIndex: index } }, { ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: "originScientific", originIndex: index } }]; for (const target of targets) if (await concepts?.breakTarget(target) === false) return; onRemove(); }
  return <div className="origin-row autocomplete-anchor"><AnchorableInput value={origin.nameKo ?? ""} onFocus={() => setFocused("ko")} onBlur={() => window.setTimeout(() => setFocused(undefined), 100)} onChange={(value) => onChange({ nameKo: value || null })} target={{ ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: "originName", originIndex: index } }} placeholder="기원식물 한글명"/><AnchorableInput className="scientific" value={origin.scientificName ?? ""} onFocus={() => setFocused("scientific")} onBlur={() => window.setTimeout(() => setFocused(undefined), 100)} onChange={(value) => onChange({ scientificName: value || null })} target={{ ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: "originScientific", originIndex: index } }} placeholder="Scientific name"/><button onClick={() => void removeRow()} aria-label="기원식물 삭제"><X size={15}/></button>{focused && matches.length ? <div className="identity-suggestions">{matches.map((item) => <button type="button" key={`${item.nameKo}-${item.scientificName}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange({ nameKo: item.nameKo, scientificName: item.scientificName }); setFocused(undefined); }}><span><strong>{item.nameKo || "한글명 없음"}</strong><em>{item.scientificName}</em></span>{item.drugs.length ? <small>{item.drugs.map((drug) => drug.name).join(" · ")}</small> : null}</button>)}</div> : null}</div>;
}

function FamilyEditor({ drugId, initialLabel, familyId, suggestions, onChange }: { drugId: string; initialLabel: string | null; familyId: string | null; suggestions: FamilySuggestion[]; onChange: (id: string | null) => void }) {
  const selected = suggestions.find((item) => item.id === familyId);
  const initialParts = (initialLabel ?? "").split(" · ");
  const [koreanQuery, setKoreanQuery] = useState(initialParts[0] ?? "");
  const [scientificQuery, setScientificQuery] = useState(initialParts[1] ?? "");
  const [focused, setFocused] = useState<"ko" | "scientific">();
  useEffect(() => { if (selected) { setKoreanQuery(selected.koreanName); setScientificQuery(selected.scientificName); } }, [selected]);
  const needle = (focused === "scientific" ? scientificQuery : koreanQuery).trim().toLocaleLowerCase();
  const matches = needle ? suggestions.filter((item) => [item.koreanName, item.scientificName, item.acceptedScientificName].some((value) => value?.toLocaleLowerCase().includes(needle))).slice(0, 8) : suggestions.slice(0, 8);
  function choose(item: FamilySuggestion) { setKoreanQuery(item.koreanName); setScientificQuery(item.scientificName); onChange(item.id); setFocused(undefined); }
  return <div className="family-row autocomplete-anchor"><AnchorableInput value={koreanQuery} onFocus={() => setFocused("ko")} onBlur={() => window.setTimeout(() => setFocused(undefined), 100)} onChange={(value) => { setKoreanQuery(value); onChange(null); }} target={{ ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: "familyKorean" } }} placeholder="과 한글명"/><AnchorableInput className="scientific" value={scientificQuery} onFocus={() => setFocused("scientific")} onBlur={() => window.setTimeout(() => setFocused(undefined), 100)} onChange={(value) => { setScientificQuery(value); onChange(null); }} target={{ ownerType: "drug", ownerId: drugId, targetType: "drug_identifier", targetRef: { key: "familyScientific" } }} placeholder="Scientific family name"/>{focused && matches.length ? <div className="identity-suggestions">{matches.map((item) => <button type="button" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}><span><strong>{item.koreanName}</strong><em>{item.scientificName}</em></span>{item.acceptedScientificName ? <small>{item.acceptedScientificName}</small> : null}</button>)}</div> : null}</div>;
}

function AnchorableInput({ value, onChange, target, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onChange: (value: string) => void; target: ConceptTarget }) { const concepts = useConceptEngine(); return <input {...props} {...conceptTargetAttributes(target)} value={value} onContextMenu={(event) => concepts?.openMenu(event, target)} onChange={(event) => { if (concepts?.reconcileText(target, value, event.target.value) === false) return; onChange(event.target.value); }}/>; }
function newItem(): StudyItem { return { id: crypto.randomUUID(), text: "" }; }
function importanceClass(value: ImportanceLevel) { return { 중요: "important", 중간: "medium", 비중요: "low" }[value]; }
function hasContent(items: StudyItem[]): boolean { return items.some((item) => item.text.trim() || hasContent(item.children ?? [])); }
async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => window.setTimeout(resolve, 50));
  return predicate();
}
function isDrugDraft(value: unknown): value is DrugDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<DrugDraft>;
  return typeof draft.koreanName === "string" && Array.isArray(draft.origins) && Array.isArray(draft.sections);
}
function sortDrug(a: { catalogIndex: number | null; referenceIndex?: number | null; archive?: DrugArchive; name: string }, b: { catalogIndex: number | null; referenceIndex?: number | null; archive?: DrugArchive; name: string }) { return compareDrugIndexes(a, b); }
function appendItem(section: StudySection, item: StudyItem): Partial<StudySection> {
  if (!section.blocks?.length) return { items: hasContent(section.items) ? [...section.items, item] : [item] };
  const blocks = appendStudyItem(section.blocks, item, () => crypto.randomUUID());
  return { blocks, items: blocks.flatMap((block) => block.type === "items" ? block.items : []) };
}
function sortSections(sections: StudySection[], definitions: FieldDefinition[]) {
  const byId = new Map(definitions.map((field) => [field.id, field]));
  return [...sections].sort((a, b) => {
    const left = a.fieldDefinitionId ? byId.get(a.fieldDefinitionId) : undefined;
    const right = b.fieldDefinitionId ? byId.get(b.fieldDefinitionId) : undefined;
    const leftGroup = left?.kind === "custom" || !left ? 1 : 0;
    const rightGroup = right?.kind === "custom" || !right ? 1 : 0;
    return leftGroup - rightGroup || (left?.position ?? 9999) - (right?.position ?? 9999);
  });
}

function PickerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="constituent-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="constituent-picker"><header><h2>{title}</h2><button onClick={onClose} aria-label="닫기"><X size={19}/></button></header>{children}</div></div>;
}
function ConstituentPicker({ nodes, edges, onChoose, onClose }: { nodes: Taxon[]; edges: TaxonEdge[]; onChoose: (node: Taxon) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(nodes.filter((node) => node.kind === "pathway").map((node) => node.id)));
  const roots = nodes.filter((node) => !edges.some((edge) => edge.childId === node.id));
  const matches = query.trim() ? nodes.filter((node) => node.name.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <PickerShell title="Compound Tree에서 추가" onClose={onClose}><div className="search-wrap picker-search"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="경로, 성분군 검색" autoFocus/></div><div className="picker-tree">{query.trim() ? matches.map((node) => <PickerRow node={node} key={node.id} onChoose={onChoose}/>) : roots.map((node) => <PickerBranch key={node.id} node={node} nodes={nodes} edges={edges} depth={0} path={new Set()} expanded={expanded} setExpanded={setExpanded} onChoose={onChoose}/>)}</div></PickerShell>;
}
function PickerBranch({ node, nodes, edges, depth, path, expanded, setExpanded, onChoose }: { node: Taxon; nodes: Taxon[]; edges: TaxonEdge[]; depth: number; path: Set<string>; expanded: Set<string>; setExpanded: (value: Set<string>) => void; onChoose: (node: Taxon) => void }) {
  if (path.has(node.id)) return null;
  const children = edges.filter((edge) => edge.parentId === node.id).map((edge) => nodes.find((item) => item.id === edge.childId)).filter(Boolean) as Taxon[];
  const open = expanded.has(node.id); const nextPath = new Set(path).add(node.id);
  return <div><div className="picker-row" style={{ paddingLeft: 10 + taxonomyIndent(depth) }}><button className="picker-toggle" onClick={() => { const next = new Set(expanded); if (open) next.delete(node.id); else next.add(node.id); setExpanded(next); }}>{children.length ? (open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>) : <span/>}</button><PickerRow node={node} onChoose={onChoose}/></div>{open ? children.map((child) => <PickerBranch key={`${node.id}-${child.id}`} node={child} nodes={nodes} edges={edges} depth={depth + 1} path={nextPath} expanded={expanded} setExpanded={setExpanded} onChoose={onChoose}/>) : null}</div>;
}
function PickerRow({ node, onChoose }: { node: Taxon; onChoose: (node: Taxon) => void }) { return <button className="picker-label" onClick={() => onChoose(node)}><span>{node.name}</span><small>{kindLabel(node.kind)}</small></button>; }
function kindLabel(kind: string) { return { pathway: "생합성 경로", class: "성분군", subclass: "하위 성분군", compound: "개별 성분" }[kind] ?? kind; }

function RelatedDrugPicker({ type, drugs, onChoose, onCreate, onClose }: { type: RelationshipType; drugs: AvailableDrug[]; onChoose: (id: string) => void; onCreate: (name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const visible = drugs.filter((drug) => !needle || drug.name.toLocaleLowerCase().includes(needle) || drug.latinName?.toLocaleLowerCase().includes(needle) || formatDrugIndex(drug.catalogIndex, drug.referenceIndex, drug.archive).toLocaleLowerCase().includes(needle)).sort(sortDrug);
  return <PickerShell title={`${type} 추가`} onClose={onClose}><div className="search-wrap picker-search"><Search size={17}/><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="인덱스, 생약명 또는 Latin name 검색" autoFocus/></div><div className="related-picker-list">{visible.map((drug) => <button key={drug.id} onClick={() => onChoose(drug.id)}><span><strong>({formatDrugIndex(drug.catalogIndex, drug.referenceIndex, drug.archive)}, {drug.name})</strong>{drug.latinName ? <em>{drug.latinName}</em> : null}</span><small>{type}으로 추가</small></button>)}{needle && !visible.length ? <button className="create-reference-result" onClick={() => onCreate(query.trim())}><span><strong>+ “{query.trim()}”를 새로운 생약으로 추가</strong><em>시험범위 외 참고류 · 새 R 인덱스</em></span></button> : null}</div></PickerShell>;
}

function FieldPicker({ definitions, sections, onDefinitionsChange, onSave, onClose }: { definitions: FieldDefinition[]; sections: StudySection[]; onDefinitionsChange: (value: FieldDefinition[]) => void; onSave: (ids: string[]) => void; onClose: () => void }) {
  const present = new Set(sections.map((section) => section.fieldDefinitionId).filter(Boolean));
  const [selected, setSelected] = useState<Set<string>>(new Set([...present] as string[]));
  const [newName, setNewName] = useState("");
  const [newInputMode, setNewInputMode] = useState<FieldInputMode>("hierarchy4");
  const defaults = definitions.filter((field) => field.kind === "default").sort((a, b) => a.position - b.position);
  const custom = definitions.filter((field) => field.kind === "custom").sort((a, b) => a.position - b.position);
  function toggle(id: string) { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next); }
  async function create() {
    if (!newName.trim()) return;
    const response = await fetch("/api/field-definitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName, inputMode: newInputMode }) });
    const data = await response.json();
    if (!response.ok) { window.alert(data.error); return; }
    onDefinitionsChange([...definitions, data]); setSelected((current) => new Set(current).add(data.id)); setNewName("");
  }
  async function rename(field: FieldDefinition) {
    const name = window.prompt("새 필드 이름", field.name)?.trim(); if (!name) return;
    const requestedMode = window.prompt("입력 형식: hierarchy4, hierarchy3, text", field.inputMode)?.trim();
    if (!requestedMode || !["hierarchy4", "hierarchy3", "text"].includes(requestedMode)) { window.alert("입력 형식은 hierarchy4, hierarchy3, text 중 하나여야 합니다."); return; }
    const response = await fetch(`/api/field-definitions/${field.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, inputMode: requestedMode }) });
    const data = await response.json(); if (!response.ok) { window.alert(data.error); return; }
    onDefinitionsChange(definitions.map((item) => item.id === field.id ? data : item));
  }
  async function archive(field: FieldDefinition) {
    if (!window.confirm(`“${field.name}”을 목록에서 삭제할까요? 기존 생약의 내용은 유지됩니다.`)) return;
    const response = await fetch(`/api/field-definitions/${field.id}`, { method: "DELETE" }); if (!response.ok) return;
    onDefinitionsChange(definitions.filter((item) => item.id !== field.id)); setSelected((current) => { const next = new Set(current); next.delete(field.id); return next; });
  }
  return <PickerShell title="Field 수정" onClose={onClose}><div className="field-picker-body"><FieldGroup title="기본 항목" fields={defaults} present={present} selected={selected} onToggle={toggle}/><FieldGroup title="사용자 정의 항목" fields={custom} present={present} selected={selected} onToggle={toggle} onRename={rename} onArchive={archive}/><div className="new-field-card"><Plus size={18}/><input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="새로운 항목 이름"/><select value={newInputMode} onChange={(event) => setNewInputMode(event.target.value as FieldInputMode)} aria-label="입력 형식"><option value="hierarchy4">i) → ① → a) → •</option><option value="hierarchy3">① → a) → •</option><option value="text">일반 텍스트</option></select><button onClick={() => void create()}>추가</button></div></div><footer className="field-picker-footer"><span>{selected.size}개 표시</span><button onClick={() => onSave([...selected])}>변경사항 저장</button></footer></PickerShell>;
}
function FieldGroup({ title, fields, present, selected, onToggle, onRename, onArchive }: { title: string; fields: FieldDefinition[]; present: Set<string | undefined>; selected: Set<string>; onToggle: (id: string) => void; onRename?: (field: FieldDefinition) => void; onArchive?: (field: FieldDefinition) => void }) {
  return <section className="field-picker-group"><h3>{title}</h3><div className="field-card-grid">{fields.map((field) => { const added = present.has(field.id); return <div className={`field-choice-card ${selected.has(field.id) ? "selected" : ""}`} key={field.id} role="button" tabIndex={0} onClick={() => onToggle(field.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onToggle(field.id); }}><span>{field.name}</span>{selected.has(field.id) ? <Check className="field-check" size={16}/> : null}<small>{selected.has(field.id) ? (added ? "현재 표시됨" : "추가 예정") : (added ? "삭제 예정" : inputModeLabel(field.inputMode))}</small>{field.kind === "custom" ? <span className="field-card-actions"><button onClick={(event) => { event.stopPropagation(); onRename?.(field); }} title="수정"><Pencil size={13}/></button><button onClick={(event) => { event.stopPropagation(); onArchive?.(field); }} title="삭제"><Trash2 size={13}/></button></span> : null}</div>; })}</div></section>;
}
function inputModeLabel(mode: FieldInputMode) { return { hierarchy4: "4단계 위계", hierarchy3: "3단계 위계", text: "일반 텍스트" }[mode]; }
