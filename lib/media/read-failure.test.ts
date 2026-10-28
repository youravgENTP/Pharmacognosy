import assert from "node:assert/strict";
import test from "node:test";
import { classifyStorageError, classifyStorageStatus } from "@/lib/media/read-failure";

test("media diagnostics distinguish missing originals, permissions, size-independent storage errors, and transient failures", () => {
  assert.equal(classifyStorageStatus(404, "vercel_blob").code, "NOT_FOUND");
  assert.equal(classifyStorageStatus(403, "vercel_blob").code, "PERMISSION_ERROR");
  assert.equal(classifyStorageStatus(500, "vercel_blob").code, "TRANSIENT_ERROR");
  assert.equal(classifyStorageStatus(422, "vercel_blob").code, "STORAGE_ERROR");
  assert.equal(classifyStorageError({ code: "ENOENT" }, "local").code, "NOT_FOUND");
  assert.equal(classifyStorageError({ code: "EACCES" }, "local").code, "PERMISSION_ERROR");
  assert.equal(classifyStorageError({ code: "ETIMEDOUT" }, "vercel_blob").retryable, true);
});
