import "server-only";
import sharp from "sharp";

export async function exportImageBuffer(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png" || mimeType === "image/jpeg") return buffer;
  return sharp(buffer, { animated: false }).png().toBuffer();
}
