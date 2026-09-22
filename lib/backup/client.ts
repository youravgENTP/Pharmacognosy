export async function downloadFullBackup(filenameOverride?: string) {
  const response = await fetch("/api/backup", { cache: "no-store" });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "백업을 생성하지 못했습니다."); }
  const blob = await response.blob();
  if (!blob.size) throw new Error("생성된 백업 파일이 비어 있습니다.");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = filenameOverride ?? disposition.match(/filename="([^"]+)"/)?.[1] ?? "HerbOverflow-Backup.zip";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { size: blob.size, filename };
}

export function preRestoreFilename(date = new Date()) { return `HerbOverflow-PreRestore-${date.toISOString().replace(/[:.]/g, "-")}.zip`; }
