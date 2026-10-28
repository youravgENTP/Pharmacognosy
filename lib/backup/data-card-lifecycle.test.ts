import assert from "node:assert/strict";
import test from "node:test";
import { dataCardBackupEligibility } from "@/lib/backup/data-card-lifecycle";

const time = (value: string) => new Date(value);

test("open Data Card autosaves are not eligible until close and both 60-second windows pass", () => {
  const savedAt = time("2026-10-29T01:00:00.000Z");
  assert.equal(dataCardBackupEligibility({ savedAt, sessions: [{ lastSeenAt: time("2026-10-29T01:01:20.000Z"), closedAt: null, closeVerified: false }], now: time("2026-10-29T01:02:30.000Z") }).active, true);
  assert.equal(dataCardBackupEligibility({ savedAt, sessions: [{ lastSeenAt: time("2026-10-29T01:01:20.000Z"), closedAt: time("2026-10-29T01:01:20.000Z"), closeVerified: true }], now: time("2026-10-29T01:02:19.000Z") }).eligible, false);
  assert.equal(dataCardBackupEligibility({ savedAt, sessions: [{ lastSeenAt: time("2026-10-29T01:01:20.000Z"), closedAt: time("2026-10-29T01:01:20.000Z"), closeVerified: true }], now: time("2026-10-29T01:02:20.000Z") }).eligible, true);
});

test("stale abandoned sessions expire without blocking recovery forever", () => {
  const input = { savedAt: time("2026-10-29T01:00:00.000Z"), sessions: [{ lastSeenAt: time("2026-10-29T01:00:10.000Z"), closedAt: null, closeVerified: true }] };
  const duringPostExpiryGrace = dataCardBackupEligibility({ ...input, now: time("2026-10-29T01:02:00.000Z") });
  assert.equal(duringPostExpiryGrace.active, false);
  assert.equal(duringPostExpiryGrace.eligible, false);
  const result = dataCardBackupEligibility({ ...input, now: time("2026-10-29T01:03:00.000Z") });
  assert.equal(result.active, false);
  assert.equal(result.eligible, true);
});

test("an expired but unverified browser session never masquerades as a complete save", () => {
  const result = dataCardBackupEligibility({ savedAt: time("2026-10-29T01:00:00.000Z"), sessions: [{ lastSeenAt: time("2026-10-29T01:00:10.000Z"), closedAt: null, closeVerified: false }], now: time("2026-10-29T02:00:00.000Z") });
  assert.equal(result.active, false);
  assert.equal(result.unverified, true);
  assert.equal(result.eligible, false);
});
