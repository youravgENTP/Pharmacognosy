# Persistent incremental backup operations

HerbOverflow's lightweight `지금 백업` path remains the default database ZIP and does not require any of the infrastructure below. The incremental full-backup feature is opt-in and serves only ZIPs that have completed manifest, row-count, size, and SHA-256 verification.

## Architecture

- PostgreSQL triggers write a monotonic mutation revision to `backup_outbox` in the same transaction as every backup-relevant insert, update, or delete.
- `backup_media_assets` is a durable, resumable queue for copying primary media into independent backup object storage. Objects are content-addressed by SHA-256 and shared safely by duplicate media.
- A bounded worker recovers abandoned leases, retries failed work with exponential backoff, backfills existing media, coalesces changes, and creates immutable full snapshots.
- A full snapshot reads all backup tables in a read-only `REPEATABLE READ` transaction. It records both the maximum mutation revision and `txid_current_snapshot()` boundary.
- ZIP generation streams verified cached media, verifies the completed ZIP locally, publishes through a temporary object, verifies the published object, and only then changes the database state to `ready`.
- Snapshot-to-media foreign keys use `ON DELETE RESTRICT`. Removing current media metadata therefore never permits referenced historical content to be garbage-collected.
- The newest older `ready` snapshot stays downloadable while a replacement is pending or failed.

The migration is [`drizzle/0017_dry_nitro.sql`](../drizzle/0017_dry_nitro.sql). Applying it creates the queue/cache/snapshot tables, mutation triggers, an initial media backfill, and the singleton worker state. Do not run it against production until a normal lightweight backup has been downloaded and verified.

## Required configuration

Set these only after provisioning a bucket or S3-compatible account with a failure domain independent from the primary media backend:

```dotenv
INCREMENTAL_BACKUP_ENABLED=true
BACKUP_STORAGE_PROVIDER=s3
BACKUP_S3_BUCKET=private-backup-bucket
BACKUP_S3_REGION=ap-northeast-2
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_PREFIX=herboverflow
BACKUP_WORKER_SECRET=...
```

Optional S3-compatible settings:

```dotenv
BACKUP_S3_ENDPOINT=https://...
BACKUP_S3_FORCE_PATH_STYLE=false
```

Worker and retention defaults can be overridden:

```dotenv
BACKUP_MAX_RETRIES=8
BACKUP_WORKER_INTERVAL_MS=30000
BACKUP_SNAPSHOT_DEBOUNCE_MS=300000
BACKUP_MAX_STALENESS_MS=3600000
BACKUP_RECONCILIATION_INTERVAL_MS=3600000
BACKUP_SNAPSHOT_RETENTION_COUNT=5
```

Development defaults to a local `.backup-storage` directory. Production deliberately rejects local storage. Do not reuse the primary Vercel Blob bucket or credentials for disaster-recovery storage, and never expose the backup bucket publicly.

## Worker deployment

The reliable option for large media sets is a continuously supervised Node worker in a separate container or managed worker service:

```sh
npm run backup:worker:watch
```

For platforms that provide durable scheduled invocations, call `GET` or `POST /api/backup/worker` with `Authorization: Bearer $BACKUP_WORKER_SECRET`. Each invocation is bounded; call it repeatedly (for example, every minute) until queues are caught up. A serverless invocation may be terminated at its duration limit, but database leases make the next invocation resume abandoned work safely. Do not use an unawaited Promise in an application request as a worker.

The worker needs the same `DATABASE_URL` as the application plus the backup S3 settings. Limit the credentials to the configured bucket prefix. Rotate `BACKUP_WORKER_SECRET` independently from application authentication.

## Deployment order and backfill

1. Download and parse a normal `지금 백업` ZIP. Confirm that its manifest and database files verify.
2. Provision private independent object storage, lifecycle/versioning policy, credentials, and the worker runtime.
3. Deploy code with `INCREMENTAL_BACKUP_ENABLED=false`. The existing lightweight backup and Restore remain operational.
4. Review and apply migration 0017 once to the production database. Confirm all new tables/triggers and the Drizzle journal entry.
5. Configure the worker and storage secrets, enable the feature flag, and start the worker.
6. Monitor `미디어 대기`, failed media, worker heartbeat, and storage usage in Settings → Database → Backup. The migration queues every existing media asset, and the worker resumes this initial backfill in limited-concurrency batches.
7. Wait until pending/failed media are zero. Request `최신 전체 스냅샷 생성`, wait for `ready`, download it, and independently parse/verify it before treating rollout as complete.

Disabling `INCREMENTAL_BACKUP_ENABLED` stops new processing without affecting primary saves or the lightweight backup. Do not roll back migration 0017 while triggers are installed; disable the flag and worker first, retain the independent objects, then use a separately reviewed forward migration if schema removal is ever necessary.

## Monitoring and troubleshooting

The Backup UI reports the last mutation, latest verified snapshot, pending revisions, media queue counts, build progress, worker state, errors, and accounted storage bytes. Alert when:

- the worker heartbeat is older than two invocation intervals;
- `backup_media_assets.status = 'failed'` is nonzero;
- a snapshot remains in a processing state beyond the lease timeout;
- pending revisions remain above zero longer than `BACKUP_MAX_STALENESS_MS`;
- independent bucket capacity, request rate, or egress cost approaches its limit.

The reconciliation pass resets abandoned work, inserts missing media jobs, and emits a periodic reconciliation revision. Failed media and snapshots retain their per-item error text and retry timestamp. Logs must identify snapshot/media IDs, never credentials, signed URLs, or secret values.

Storage cost consists of one deduplicated immutable media object per unique SHA-256, retained snapshot ZIPs, request charges, and download egress. `BACKUP_SNAPSHOT_RETENTION_COUNT` marks excess verified snapshots as `superseded`; object deletion is intentionally not automatic. Define a reviewed bucket lifecycle/garbage-collection process that checks snapshot references before deletion.

## Restore boundary

Prebuilt ZIPs use the existing v1 HerbOverflow manifest and are parseable by the current Restore preview. Current Restore continues to restore selected database fields only; it does **not** restore original image binaries. The UI states this limitation. A future media restore must provide collision checks, an atomic primary-storage/DB commit strategy, and explicit administrator approval before it can be enabled.
