import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_PREFIX = "local/";
const LOCAL_URL_PREFIX = "local://";

export function canUseLocalMedia() {
  return process.env.NODE_ENV !== "production";
}

export function isLocalMedia(pathname: string) {
  return pathname.startsWith(LOCAL_PREFIX);
}

export async function writeLocalMedia(file: File, safeName: string) {
  const filename = `${crypto.randomUUID()}-${safeName}`;
  const pathname = `${LOCAL_PREFIX}${filename}`;
  const directory = path.join(process.cwd(), ".local-media");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
  return { url: `${LOCAL_URL_PREFIX}${pathname}`, pathname };
}

export async function readLocalMedia(pathname: string) {
  if (!isLocalMedia(pathname)) return null;
  return readFile(path.join(process.cwd(), ".local-media", path.basename(pathname)));
}

export async function deleteLocalMedia(pathname: string) {
  if (!isLocalMedia(pathname)) return;
  await unlink(path.join(process.cwd(), ".local-media", path.basename(pathname))).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
