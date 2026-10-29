import type { ImportanceLevel, OriginPlant, StudySection } from "@/lib/db/schema";
import { compareDataCardContent } from "@/lib/data-card-content";

export type DataCardContent = {
  koreanName: string;
  latinName: string | null;
  origin: string | null;
  origins: OriginPlant[];
  scientificName: string | null;
  medicinalPart: string | null;
  familyId: string | null;
  importance: ImportanceLevel;
  sections: StudySection[];
};

export type MergeChoice = "local" | "remote" | "both";
export type MergeConflict = {
  path: string;
  kind: "value" | "delete-modify" | "add-add" | "order" | "unmatched-array";
  base: unknown;
  local: unknown;
  remote: unknown;
  canKeepBoth: boolean;
};
export type MergeResult<T> = { value: T; conflicts: MergeConflict[]; automaticMerges: number; unresolved: number };
export type MergeResolutions = Record<string, MergeChoice>;

const absent = Symbol("absent");
type Maybe = unknown | typeof absent;

export function threeWayMerge<T>(base: T, local: T, remote: T, resolutions: MergeResolutions = {}): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  let automaticMerges = 0;

  const merge = (baseValue: Maybe, localValue: Maybe, remoteValue: Maybe, path: string): Maybe => {
    if (same(localValue, remoteValue)) return cloneMaybe(localValue);
    if (same(localValue, baseValue)) { automaticMerges += 1; return cloneMaybe(remoteValue); }
    if (same(remoteValue, baseValue)) { automaticMerges += 1; return cloneMaybe(localValue); }

    if (Array.isArray(baseValue) && Array.isArray(localValue) && Array.isArray(remoteValue)) {
      if (isStableIdArray(baseValue) && isStableIdArray(localValue) && isStableIdArray(remoteValue)) {
        return mergeStableArray(baseValue, localValue, remoteValue, path);
      }
      const canKeepBoth = isAppendOnly(baseValue, localValue) && isAppendOnly(baseValue, remoteValue);
      return choose(path, "unmatched-array", baseValue, localValue, remoteValue, canKeepBoth,
        canKeepBoth ? dedupe([...localValue, ...remoteValue]) : undefined);
    }

    if (isRecord(baseValue) && isRecord(localValue) && isRecord(remoteValue)) {
      const result: Record<string, unknown> = {};
      const keys = new Set([...Object.keys(baseValue), ...Object.keys(localValue), ...Object.keys(remoteValue)]);
      for (const key of keys) {
        const child = merge(key in baseValue ? baseValue[key] : absent, key in localValue ? localValue[key] : absent, key in remoteValue ? remoteValue[key] : absent, join(path, key));
        if (child !== absent) result[key] = child;
      }
      return result;
    }

    const kind = localValue === absent || remoteValue === absent ? "delete-modify" : baseValue === absent ? "add-add" : "value";
    return choose(path, kind, baseValue, localValue, remoteValue, false);
  };

  const mergeStableArray = (baseArray: Record<string, unknown>[], localArray: Record<string, unknown>[], remoteArray: Record<string, unknown>[], path: string) => {
    const baseMap = new Map(baseArray.map((item) => [String(item.id), item]));
    const localMap = new Map(localArray.map((item) => [String(item.id), item]));
    const remoteMap = new Map(remoteArray.map((item) => [String(item.id), item]));
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    const merged = new Map<string, unknown>();
    for (const id of ids) {
      const item = merge(baseMap.get(id) ?? absent, localMap.get(id) ?? absent, remoteMap.get(id) ?? absent, `${path}[id=${id}]`);
      if (item !== absent) merged.set(id, item);
    }

    const baseIds = new Set(baseArray.map(idOf));
    const baseOrder = baseArray.map(idOf).filter((id) => merged.has(id));
    const localOrder = localArray.map(idOf).filter((id) => merged.has(id));
    const remoteOrder = remoteArray.map(idOf).filter((id) => merged.has(id));
    const localExisting = localOrder.filter((id) => baseIds.has(id));
    const remoteExisting = remoteOrder.filter((id) => baseIds.has(id));
    let order: string[];
    if (same(localExisting, remoteExisting)) order = localExisting;
    else if (same(localExisting, baseOrder)) { automaticMerges += 1; order = remoteExisting; }
    else if (same(remoteExisting, baseOrder)) { automaticMerges += 1; order = localExisting; }
    else {
      const orderPath = `${path}.$order`;
      const selected = choose(orderPath, "order", baseOrder, localExisting, remoteExisting, false);
      order = Array.isArray(selected) ? selected as string[] : baseOrder;
    }
    order = insertNewIds(order, localOrder, baseIds);
    order = insertNewIds(order, remoteOrder, baseIds);
    for (const id of ids) if (merged.has(id) && !order.includes(id)) order.push(id);
    return order.map((id) => merged.get(id));
  };

  const choose = (path: string, kind: MergeConflict["kind"], baseValue: Maybe, localValue: Maybe, remoteValue: Maybe, canKeepBoth: boolean, bothValue?: unknown): Maybe => {
    const conflict: MergeConflict = { path, kind, base: publicValue(baseValue), local: publicValue(localValue), remote: publicValue(remoteValue), canKeepBoth };
    conflicts.push(conflict);
    const resolution = resolutions[path];
    if (resolution === "local") return cloneMaybe(localValue);
    if (resolution === "remote") return cloneMaybe(remoteValue);
    if (resolution === "both" && canKeepBoth) return structuredClone(bothValue);
    return cloneMaybe(baseValue !== absent ? baseValue : localValue);
  };

  const value = merge(base, local, remote, "") as T;
  return { value, conflicts, automaticMerges, unresolved: conflicts.filter((conflict) => !resolutions[conflict.path] || (resolutions[conflict.path] === "both" && !conflict.canKeepBoth)).length };
}

export function sameDataCard(left: DataCardContent, right: DataCardContent) { return compareDataCardContent(left, right).equal; }

function same(left: Maybe, right: Maybe) {
  if (left === absent || right === absent) return left === right;
  return stableJson(left) === stableJson(right);
}
function cloneMaybe(value: Maybe): Maybe { return value === absent ? absent : structuredClone(value); }
function publicValue(value: Maybe) { return value === absent ? undefined : structuredClone(value); }
function isRecord(value: Maybe): value is Record<string, unknown> { if (value === absent) return false; return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isStableIdArray(value: unknown[]): value is Record<string, unknown>[] { return value.every((item) => isRecord(item) && typeof item.id === "string" && item.id.length > 0) && new Set(value.map((item) => (item as Record<string, unknown>).id)).size === value.length; }
function idOf(item: Record<string, unknown>) { return String(item.id); }
function join(path: string, key: string) { return path ? `${path}.${key}` : key; }
function isAppendOnly(base: unknown[], value: unknown[]) { return value.length >= base.length && base.every((item, index) => same(item, value[index])); }
function dedupe(values: unknown[]) { const seen = new Set<string>(); return values.filter((value) => { const key = stableJson(value); if (seen.has(key)) return false; seen.add(key); return true; }).map((value) => structuredClone(value)); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function insertNewIds(order: string[], source: string[], baseIds: Set<string>) {
  const result = [...order];
  for (let index = 0; index < source.length; index += 1) {
    const id = source[index]!;
    if (baseIds.has(id) || result.includes(id)) continue;
    const previous = [...source.slice(0, index)].reverse().find((candidate) => result.includes(candidate));
    const next = source.slice(index + 1).find((candidate) => result.includes(candidate));
    if (previous) result.splice(result.indexOf(previous) + 1, 0, id);
    else if (next) result.splice(result.indexOf(next), 0, id);
    else result.push(id);
  }
  return result;
}

export function describeMergePath(path: string) {
  const names: Record<string, string> = { koreanName: "생약명", latinName: "Latin name", origin: "기원", origins: "기원식물", scientificName: "학명", medicinalPart: "약용 부위", familyId: "과", importance: "중요도", sections: "Study Section", items: "항목", blocks: "블록", text: "텍스트", html: "서식 텍스트", mediaAssetId: "이미지", "$order": "순서", children: "하위 항목" };
  return path.split(".").map((part) => names[part] ?? part.replace(/\[id=([^\]]+)]/, " ($1)")).join(" › ");
}
