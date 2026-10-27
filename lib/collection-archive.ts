export type CollectionArchiveAction = "archive" | "unarchive";

export function collectionArchivePatch(action: CollectionArchiveAction, now = new Date()) {
  return { archivedAt: action === "archive" ? now : null };
}

export function applyCollectionArchiveSnapshot<T extends { archivedAt: Date | null }>(collection: T, action: CollectionArchiveAction, now = new Date()): T {
  return { ...structuredClone(collection), ...collectionArchivePatch(action, now) };
}
