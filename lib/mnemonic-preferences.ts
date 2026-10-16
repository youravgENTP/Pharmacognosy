import type { StudyBlock, StudyItem } from "@/lib/db/schema";

export type MnemonicVersion = {
  userId: string;
  userName: string;
  items: StudyItem[];
  blocks: StudyBlock[];
};

export type CanonicalMnemonicResolution<T extends MnemonicVersion> = {
  mnemonic: T | undefined;
  preferredMnemonicUserId: string | null;
  source: "explicit" | "own" | "fallback" | "empty";
};

/** Resolves a personal canonical mnemonic without mutating or reordering input. */
export function resolveCanonicalMnemonic<T extends MnemonicVersion>(
  currentUserId: string,
  versions: readonly T[],
  preferredMnemonicUserId?: string | null,
): CanonicalMnemonicResolution<T> {
  const explicit = preferredMnemonicUserId
    ? versions.find((version) => version.userId === preferredMnemonicUserId)
    : undefined;
  if (explicit) return { mnemonic: explicit, preferredMnemonicUserId: explicit.userId, source: "explicit" };

  const own = versions.find((version) => version.userId === currentUserId);
  if (own) return { mnemonic: own, preferredMnemonicUserId: null, source: "own" };

  const fallback = [...versions].sort(compareMnemonicVersions)[0];
  return fallback
    ? { mnemonic: fallback, preferredMnemonicUserId: null, source: "fallback" }
    : { mnemonic: undefined, preferredMnemonicUserId: null, source: "empty" };
}

export function compareMnemonicVersions(left: Pick<MnemonicVersion, "userName" | "userId">, right: Pick<MnemonicVersion, "userName" | "userId">) {
  return left.userName.localeCompare(right.userName, "ko") || left.userId.localeCompare(right.userId);
}
