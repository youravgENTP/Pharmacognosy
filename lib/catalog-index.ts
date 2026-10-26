export function allocateCatalogIndex(used: Set<number>, requested?: number) {
  if (requested !== undefined) {
    if (!Number.isInteger(requested) || requested < 1) throw new Error("Catalog index must be a positive integer");
    if (used.has(requested)) throw new Error(`Catalog index ${requested} is already in use`);
    used.add(requested);
    return requested;
  }
  let value = 1;
  while (used.has(value)) value++;
  used.add(value);
  return value;
}
