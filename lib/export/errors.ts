export type DataCardExportCode = "DATA_LOAD_FAILED" | "DOCX_RENDER_FAILED" | "INVALID_EXPORT_OUTPUT";

export class DataCardExportError extends Error {
  constructor(
    readonly code: DataCardExportCode,
    readonly safeMessage: string,
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message, { cause: options?.cause });
    this.name = "DataCardExportError";
    this.context = options?.context;
  }

  readonly context?: Record<string, unknown>;
}

export function logDataCardExportError(label: string, error: unknown, context: Record<string, unknown> = {}) {
  const resolved = error instanceof Error ? error : new Error(String(error));
  console.error(`[DataCardExport] ${label}`, { ...context, message: resolved.message, stack: resolved.stack, cause: errorCause(resolved) });
}

export function logDataCardExportWarning(label: string, error: unknown, context: Record<string, unknown> = {}) {
  const resolved = error instanceof Error ? error : new Error(String(error));
  console.warn(`[DataCardExport] ${label}`, { ...context, message: resolved.message, stack: resolved.stack, cause: errorCause(resolved) });
}

function errorCause(error: Error) {
  const cause = error.cause;
  if (cause instanceof Error) return { message: cause.message, stack: cause.stack };
  return cause;
}
