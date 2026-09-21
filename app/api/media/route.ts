import { authorizeApi } from "@/lib/auth/permissions";
import { put, del } from "@vercel/blob";
import { asc, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { IMAGE_STORAGE_QUOTA_BYTES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/media/config";
import { canUseLocalMedia, deleteLocalMedia, writeLocalMedia } from "@/lib/media/local";
import { getMediaReferences } from "@/lib/media/references";

export const runtime = "nodejs";

export async function GET(request: Request) { const authError = await authorizeApi("user"); if (authError) return authError;
  const sort = new URL(request.url).searchParams.get("sort") === "newest" ? "newest" : "size";
  const assets = await db.select().from(mediaAssets).orderBy(sort === "newest" ? desc(mediaAssets.createdAt) : desc(mediaAssets.sizeBytes), asc(mediaAssets.originalFilename));
  const references = await getMediaReferences();
  const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  return NextResponse.json({
    stats: { totalBytes, quotaBytes: IMAGE_STORAGE_QUOTA_BYTES, percentage: IMAGE_STORAGE_QUOTA_BYTES ? totalBytes / IMAGE_STORAGE_QUOTA_BYTES * 100 : 0, count: assets.length, averageBytes: assets.length ? Math.round(totalBytes / assets.length) : 0, largestBytes: assets[0] && sort === "size" ? assets[0].sizeBytes : Math.max(0, ...assets.map((asset) => asset.sizeBytes)), orphanCount: assets.filter((asset) => !references.has(asset.id)).length, orphanBytes: assets.filter((asset) => !references.has(asset.id)).reduce((sum, asset) => sum + asset.sizeBytes, 0) },
    assets: assets.map((asset) => ({ ...asset, contentUrl: `/api/media/${asset.id}/content`, references: references.get(asset.id) ?? [] })),
  });
}

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
  if (!blobConfigured && !canUseLocalMedia()) return NextResponse.json({ error: "Vercel Blob 환경변수가 설정되지 않았습니다." }, { status: 503 });
  const form = await request.formData();
  const file = form.get("file");
  const width = Number(form.get("width")); const height = Number(form.get("height"));
  if (!(file instanceof File) || !file.type.startsWith("image/") || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return NextResponse.json({ error: "올바른 이미지 파일과 크기가 필요합니다." }, { status: 400 });
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return NextResponse.json({ error: `이미지는 ${Math.round(MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024)}MB 이하여야 합니다.` }, { status: 413 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "image";
  const stored = blobConfigured
    ? await put(`study-images/${crypto.randomUUID()}-${safeName}`, file, { access: "private", addRandomSuffix: false, contentType: file.type })
    : await writeLocalMedia(file, safeName);
  try {
    const [asset] = await db.insert(mediaAssets).values({ blobUrl: stored.url, blobPathname: stored.pathname, originalFilename: file.name, sizeBytes: file.size, mimeType: file.type, width, height }).returning();
    return NextResponse.json({ ...asset, contentUrl: `/api/media/${asset.id}/content` }, { status: 201 });
  } catch (error) {
    if (blobConfigured) await del(stored.url).catch(() => undefined);
    else await deleteLocalMedia(stored.pathname).catch(() => undefined);
    throw error;
  }
}
