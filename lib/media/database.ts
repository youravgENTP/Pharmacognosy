const DATABASE_PREFIX = "database/";

export function isDatabaseMedia(pathname: string) {
  return pathname.startsWith(DATABASE_PREFIX);
}

export async function writeDatabaseMedia(file: File, safeName: string) {
  const pathname = `${DATABASE_PREFIX}${crypto.randomUUID()}-${safeName}`;
  const content = Buffer.from(await file.arrayBuffer()).toString("base64");
  return { url: `data:${file.type};base64,${content}`, pathname };
}

export function readDatabaseMedia(url: string) {
  const separator = url.indexOf(",");
  if (separator < 0 || !url.slice(0, separator).endsWith(";base64")) return null;
  return Buffer.from(url.slice(separator + 1), "base64");
}
