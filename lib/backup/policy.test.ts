import assert from "node:assert/strict";
import test from "node:test";
import { canAttemptCatchUpPeriod, catchUpAttemptKey, defaultBackupPolicy, duePeriod, isValidRestoreSafetyTicket } from "@/lib/backup/policy";

test("daily overdue is calculated from explicit local timezone and scheduled wall time", () => {
  const policy = { ...defaultBackupPolicy, enabled: true, frequency: "daily" as const, time: "03:00", timezone: "Asia/Seoul" };
  const before = duePeriod(policy, new Date("2026-09-23T17:30:00.000Z")); // Sep 24 02:30 KST
  assert.equal(before.dueAt, "2026-09-22T18:00:00.000Z");
  assert.equal(before.nextAt, "2026-09-23T18:00:00.000Z");
  const after = duePeriod({ ...policy, lastSuccessfulLocalBackupAt: "2026-09-23T18:01:00.000Z" }, new Date("2026-09-23T20:00:00.000Z"));
  assert.equal(after.overdue, false);
  assert.equal(after.periodKey, "2026-09-23T18:00:00.000Z");
});

test("weekly catch-up stays on the same overdue period and advances by local calendar week", () => {
  const policy = { ...defaultBackupPolicy, enabled: true, frequency: "weekly" as const, time: "03:00", timezone: "America/New_York" };
  const monday = duePeriod(policy, new Date("2026-03-09T12:00:00.000Z"));
  const refocus = duePeriod({ ...policy, lastAttemptPeriodKey: monday.periodKey }, new Date("2026-03-10T12:00:00.000Z"));
  assert.equal(refocus.periodKey, monday.periodKey);
  assert.equal(monday.dueAt, "2026-03-09T07:00:00.000Z");
  assert.equal(monday.nextAt, "2026-03-16T07:00:00.000Z");
});

test("disabled policy is never overdue", () => {
  assert.deepEqual(duePeriod(defaultBackupPolicy, new Date("2026-09-23T00:00:00Z")), { overdue: false, dueAt: null, nextAt: null, periodKey: null });
});

test("the same overdue period cannot initiate a duplicate catch-up", () => {
  const periodKey = "2026-09-23T18:00:00.000Z";
  assert.equal(canAttemptCatchUpPeriod(defaultBackupPolicy, periodKey), true);
  assert.equal(canAttemptCatchUpPeriod({ ...defaultBackupPolicy, lastAttemptPeriodKey: periodKey }, periodKey), false);
  assert.equal(catchUpAttemptKey(periodKey), catchUpAttemptKey(periodKey));
});

test("restore safety backup ticket is required, one-time, and expires", () => {
  const now = new Date("2026-09-23T08:00:00.000Z");
  const ticket = { token: "safety-token", createdAt: "2026-09-23T07:50:00.000Z", consumed: false };
  assert.equal(isValidRestoreSafetyTicket(ticket, "safety-token", now), true);
  assert.equal(isValidRestoreSafetyTicket(ticket, "wrong", now), false);
  assert.equal(isValidRestoreSafetyTicket({ ...ticket, consumed: true }, "safety-token", now), false);
  assert.equal(isValidRestoreSafetyTicket({ ...ticket, createdAt: "2026-09-23T07:40:00.000Z" }, "safety-token", now), false);
});
