export function isMissingPreferenceTable(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (value.code === "42P01" && typeof value.message === "string" && value.message.includes("user_mnemonic_preferences")) return true;
    current = value.cause;
  }
  return false;
}
