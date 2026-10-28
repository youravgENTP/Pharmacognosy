import assert from "node:assert/strict";
import test from "node:test";
import { backupFreshness, backupRetryDelayMs, shouldScheduleSnapshot, snapshotDownloadState, snapshotIdsBeyondRetention } from "@/lib/backup/incremental";

test("backup retry uses capped exponential backoff", () => {
  assert.equal(backupRetryDelayMs(1, 100, 1_000), 100);
  assert.equal(backupRetryDelayMs(4, 100, 1_000), 800);
  assert.equal(backupRetryDelayMs(8, 100, 1_000), 1_000);
});

test("rapid edits are coalesced until debounce while maximum staleness forces a snapshot", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");
  const common = { pendingChanges: 5, hasActiveBuild: false, now, debounceMs: 300_000, maximumStalenessMs: 3_600_000 };
  assert.equal(shouldScheduleSnapshot({ ...common, oldestPendingAt: new Date("2026-10-28T11:59:00.000Z"), latestReadyAt: new Date("2026-10-28T11:30:00.000Z") }), false);
  assert.equal(shouldScheduleSnapshot({ ...common, oldestPendingAt: new Date("2026-10-28T11:54:00.000Z"), latestReadyAt: new Date("2026-10-28T11:30:00.000Z") }), true);
  assert.equal(shouldScheduleSnapshot({ ...common, oldestPendingAt: new Date("2026-10-28T11:59:00.000Z"), latestReadyAt: new Date("2026-10-28T10:00:00.000Z") }), true);
  assert.equal(shouldScheduleSnapshot({ ...common, force: true, oldestPendingAt: now, latestReadyAt: now }), true);
  assert.equal(shouldScheduleSnapshot({ ...common, hasActiveBuild: true, force: true }), false);
});

test("freshness reports exact pending revisions and never labels a stale ZIP current", () => {
  assert.deepEqual(backupFreshness(14, 10), { pendingChanges: 4, synchronized: false });
  assert.deepEqual(backupFreshness(14, 14), { pendingChanges: 0, synchronized: true });
  assert.deepEqual(snapshotDownloadState(14, { status: "ready", includedRevision: 10 }), { available: true, stale: true });
  assert.deepEqual(snapshotDownloadState(14, { status: "ready", includedRevision: 14 }), { available: true, stale: false });
  assert.deepEqual(snapshotDownloadState(14, { status: "failed", includedRevision: 14 }), { available: false, stale: true });
});

test("failed newer snapshots do not displace verified retention candidates", () => {
  const ordered = [
    { id: "failed-new", status: "failed" },
    { id: "ready-new", status: "ready" },
    { id: "retrying", status: "retrying" },
    { id: "ready-old", status: "ready" },
  ];
  assert.deepEqual(snapshotIdsBeyondRetention(ordered, 1), ["ready-old"]);
  assert.deepEqual(snapshotIdsBeyondRetention(ordered, 2), []);
});
