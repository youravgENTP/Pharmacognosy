CREATE TABLE "backup_snapshot_captures" (
	"snapshot_id" uuid PRIMARY KEY NOT NULL,
	"tables" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consistency_boundary" text NOT NULL,
	"schema_version" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_card_edit_sessions" ADD COLUMN "close_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "data_card_edit_sessions" ADD COLUMN "verified_revision" integer;--> statement-breakpoint
ALTER TABLE "data_card_edit_sessions" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "data_card_edit_sessions" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "backup_snapshot_captures" ADD CONSTRAINT "backup_snapshot_captures_snapshot_id_backup_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."backup_snapshots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
UPDATE "data_card_edit_sessions" AS session
SET "close_verified" = true,
    "verified_revision" = drug."data_revision",
    "verified_at" = session."closed_at"
FROM "crude_drugs" AS drug
WHERE session."closed_at" IS NOT NULL
  AND session."drug_id" = drug."id"
  AND EXISTS (
    SELECT 1 FROM "data_card_revisions" AS revision
    WHERE revision."drug_id" = drug."id"
      AND revision."revision" = drug."data_revision"
  );
