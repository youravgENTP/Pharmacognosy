import sharp from "sharp";

export class ExportImageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) { super(message, options); this.name = "ExportImageError"; }
}

export async function exportImageBuffer(buffer: Buffer, mimeType: string) {
  if (!buffer.length) throw new ExportImageError("Image buffer is empty");
  try {
    const image = sharp(buffer, { animated: false, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.format || !metadata.width || !metadata.height) throw new Error("Image metadata is incomplete");
    if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height) || metadata.width <= 0 || metadata.height <= 0) throw new Error("Image dimensions are invalid");
    if (metadata.format === "png" || metadata.format === "jpeg") return buffer;
    return await image.png().toBuffer();
  } catch (cause) {
    throw new ExportImageError(`Unable to decode or normalize image (${mimeType || "unknown MIME type"})`, { cause });
  }
}
