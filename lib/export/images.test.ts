import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { ExportImageError, exportImageBuffer } from "@/lib/export/images";

test("image export detects actual bytes instead of trusting MIME and normalizes WebP", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "green" } }).png().toBuffer();
  assert.equal(await exportImageBuffer(png, "image/webp"), png);
  const webp = await sharp(png).webp().toBuffer();
  const normalized = await exportImageBuffer(webp, "image/png");
  assert.equal(normalized[0], 0x89);
  assert.equal(normalized[1], 0x50);
});

test("corrupt image bytes produce a typed conversion error", async () => {
  await assert.rejects(() => exportImageBuffer(Buffer.from("broken"), "image/jpeg"), ExportImageError);
});
