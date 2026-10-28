ALTER TABLE "backup_media_assets" ADD COLUMN "source_fingerprint" text;--> statement-breakpoint
ALTER TABLE "backup_snapshots" ADD COLUMN "allow_incomplete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_snapshots" ADD COLUMN "completeness" text;--> statement-breakpoint
ALTER TABLE "backup_snapshots" ADD COLUMN "missing_media" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "backup_media_assets" AS backup
SET "source_fingerprint" = concat(asset."blob_pathname", '|', asset."size_bytes", '|', asset."mime_type", '|', floor(extract(epoch FROM asset."updated_at") * 1000)::bigint)
FROM "media_assets" AS asset
WHERE backup."media_asset_id" = asset."id" AND backup."status" = 'verified';
