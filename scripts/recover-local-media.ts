import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { and, eq, inArray } from "drizzle-orm";

dotenv.config({ path: ".env.local" });
const [{ db }, { mediaAssets }, { isLocalMedia, readLocalMedia }] = await Promise.all([import("@/lib/db"), import("@/lib/db/schema"), import("@/lib/media/local")]);

const rawIds = process.argv.find((value) => value.startsWith("--ids="))?.slice("--ids=".length);
const ids = rawIds ? [...new Set(rawIds.split(",").filter(Boolean))] : [];
if (!ids.length) throw new Error("Usage: npm run media:recover-local -- --ids=<uuid,uuid>");
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required for local-media recovery. No database records were changed.");

const assets = await db.select().from(mediaAssets).where(inArray(mediaAssets.id, ids));
if (assets.length !== ids.length) throw new Error("One or more media IDs do not exist. No database records were changed.");

for (const asset of assets) {
  if (!isLocalMedia(asset.blobPathname)) throw new Error(`${asset.id} is not local media. No database records were changed for this item.`);
  const bytes = await readLocalMedia(asset.blobPathname);
  if (!bytes) throw new Error(`${asset.id} local original is missing. No database record was changed.`);
  if (bytes.length !== asset.sizeBytes) throw new Error(`${asset.id} local original size differs from metadata. No database record was changed.`);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const filename = (asset.originalFilename ?? "image").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const stored = await put(`study-images/recovered-${asset.id}-${filename}`, bytes, { access: "private", addRandomSuffix: false, contentType: asset.mimeType });
  const verified = await get(stored.url, { access: "private" });
  if (!verified || verified.statusCode !== 200) throw new Error(`${asset.id} uploaded Blob could not be verified. The original local file remains untouched.`);
  const uploaded = Buffer.from(await new Response(verified.stream).arrayBuffer());
  if (uploaded.length !== bytes.length || createHash("sha256").update(uploaded).digest("hex") !== checksum) throw new Error(`${asset.id} uploaded Blob checksum verification failed. The original local file remains untouched.`);
  const updated = await db.update(mediaAssets).set({ blobUrl: stored.url, blobPathname: stored.pathname, updatedAt: new Date() }).where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.blobPathname, asset.blobPathname))).returning({ id: mediaAssets.id });
  if (!updated.length) throw new Error(`${asset.id} metadata changed while recovering; uploaded object was retained but DB was not changed.`);
  console.log(JSON.stringify({ id: asset.id, status: "recovered", bytes: uploaded.length }));
}
