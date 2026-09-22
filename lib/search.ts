export function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function includesSearch(query: string, values: Array<string | null | undefined>) {
  const needle = normalizeSearch(query);
  return !needle || values.some((value) => normalizeSearch(value).includes(needle));
}
