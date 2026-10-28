# Local backup operations

HerbOverflow backup uses only the deployed Vercel application, PostgreSQL, the current primary image store, and the administrator's browser. No independent S3/R2 bucket or externally hosted Worker is required.

## Two independent backup paths

- `지금 백업` keeps the existing v1 database ZIP path. It contains all configured database tables and image metadata, but not image binaries. It does not read image originals, so a missing image cannot break it.
- `지금 동기화` creates an image-inclusive local ZIP. It first verifies that every Data Card edit session closed normally and that every current card revision has an immutable revision record. A short shared advisory lock then captures all backup tables in one `REPEATABLE READ` transaction. The lock is released before any image download or ZIP compression.

The frozen capture is stored in `backup_snapshot_captures`. The browser downloads its database ZIP once, collects image originals from the current primary media API with concurrency 3, verifies size and SHA-256, and builds the compatible v1 ZIP locally. The generated ZIP is reopened with CRC checking and every media hash is verified before a download is initiated.

If a Data Card is reopened after capture, the new edit belongs to a future backup; it cannot alter the frozen capture. Manual synchronization deliberately bypasses the automatic 60-second debounce, but never bypasses verified close or immutable revision checks.

## Browser cache and failure behavior

Verified image blobs are cached in IndexedDB by media ID and a fingerprint of immutable source metadata. Every cached blob is size/hash checked before reuse. A changed fingerprint or corrupt cache entry is discarded and fetched again. Fetches retry with exponential backoff; non-retryable not-found, permission, or size mismatch errors stop immediately.

If any image fails, HerbOverflow does not create or download a ZIP labeled complete. The UI lists the image ID, filename, and classified error and offers diagnostics/retry. A retry starts a new frozen DB capture while reusing still-valid cached image blobs, so successful images need not be downloaded again.

Browser ZIP generation is capped by `FULL_MEDIA_BACKUP_MAX_BYTES` (default 250 MiB) to avoid unsafe memory pressure. JSZip still needs browser memory for the archive, so very large future datasets require chunked/export-volume design rather than pretending a Vercel request can safely stream an unlimited ZIP. Local downloads and scheduled catch-up are only possible while a browser is open and permits downloads.

## Data Card save boundary

Normal close flushes the primary card plus separate mnemonic/preference/relationship/identity queues. The server verifies the semantic card hash, immutable revision, and separately stored relationship/identity membership before marking the edit session `close_verified`. A failed save preserves the local recovery draft and blocks close. Backup status or image I/O is never part of the Data Card save response.

Abnormal browser termination leaves an unverified session. Lease expiry is not treated as a successful close and blocks manual synchronization until the session is recovered and verified.

## Migrations and legacy incremental tables

- `0017` originally introduced the external incremental outbox/worker tables.
- `0019` removed the `crude_drugs` outbox trigger and added immutable Data Card revisions.
- `0021` adds verified-close fields and frozen snapshot captures.
- `0022` removes the remaining `backup_outbox_*` triggers so ordinary saves no longer pay for an unused external queue. It does not delete `backup_outbox`, `backup_snapshots`, cached media rows, Worker state, or any user data.

Legacy Worker/storage code and historical records remain for compatibility, but the normal Backup UI and `지금 동기화` do not require or invoke them. Do not apply migrations automatically in production. First download and verify a basic backup, deploy the code, apply pending migrations during a maintenance window, and retest Data Card close plus both backup paths.

## Restore boundary

Both ZIP types use the existing v1 manifest and remain parseable by Restore preview. Current Restore restores selected database fields only; it does not upload image binaries back to primary storage. The UI states this explicitly. A future media restore needs collision handling, storage/DB consistency, rollback, and separate administrator approval.
