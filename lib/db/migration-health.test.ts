import assert from "node:assert/strict";
import test from "node:test";
import { backupCoversCurrentSchema, collectionMigrationState, isUndefinedColumnError } from "@/lib/db/migration-health";

test("Collections migration health distinguishes before, after, and inconsistent states", () => {
  assert.equal(collectionMigrationState(false, false), "migration-missing");
  assert.equal(collectionMigrationState(true, true), "ready");
  assert.equal(collectionMigrationState(true, false), "journal-missing");
  assert.equal(collectionMigrationState(false, true), "schema-missing");
});

test("Collections API can identify a wrapped archived_at undefined-column failure", () => {
  const error = Object.assign(new Error('Failed query: select "archived_at" from "collections"'), { cause: Object.assign(new Error('column "archived_at" does not exist'), { code: "42703" }) });
  assert.equal(isUndefinedColumnError(error, "archived_at"), true);
  assert.equal(isUndefinedColumnError(new Error('Failed query: select "archived_at" from "collections"'), "archived_at"), false);
  assert.equal(isUndefinedColumnError(new Error("network failure"), "archived_at"), false);
});

test("field initialization requires a recent successful backup covering the latest migration", () => {
  const now = new Date("2026-10-27T06:00:00.000Z"); const migration = new Date("2026-10-27T04:43:15.706Z").getTime();
  assert.equal(backupCoversCurrentSchema(null, migration, now), false);
  assert.equal(backupCoversCurrentSchema("2026-10-27T04:00:00.000Z", migration, now), false);
  assert.equal(backupCoversCurrentSchema("2026-10-27T05:00:00.000Z", migration, now), true);
});
