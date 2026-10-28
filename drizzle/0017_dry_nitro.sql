CREATE TABLE "backup_media_assets" (
	"media_asset_id" uuid PRIMARY KEY NOT NULL,
	"sha256" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_media_objects" (
	"sha256" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_media_objects_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "backup_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision" bigserial NOT NULL,
	"table_name" text NOT NULL,
	"operation" text NOT NULL,
	"entity_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_outbox_revision_unique" UNIQUE("revision")
);
--> statement-breakpoint
CREATE TABLE "backup_snapshot_media" (
	"snapshot_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "backup_snapshot_media_snapshot_id_media_asset_id_pk" PRIMARY KEY("snapshot_id","media_asset_id")
);
--> statement-breakpoint
CREATE TABLE "backup_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"target_revision" bigint NOT NULL,
	"included_revision" bigint,
	"consistency_boundary" text,
	"schema_version" text,
	"storage_backend" text,
	"storage_key" text,
	"zip_sha256" text,
	"data_card_count" integer,
	"media_count" integer,
	"media_bytes" bigint,
	"zip_bytes" bigint,
	"progress_current" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_worker_state" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_started_at" timestamp with time zone,
	"last_run_completed_at" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	"last_error" text,
	"processed_jobs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_media_assets" ADD CONSTRAINT "backup_media_assets_sha256_backup_media_objects_sha256_fk" FOREIGN KEY ("sha256") REFERENCES "public"."backup_media_objects"("sha256") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_snapshot_media" ADD CONSTRAINT "backup_snapshot_media_snapshot_id_backup_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."backup_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_snapshot_media" ADD CONSTRAINT "backup_snapshot_media_sha256_backup_media_objects_sha256_fk" FOREIGN KEY ("sha256") REFERENCES "public"."backup_media_objects"("sha256") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_snapshots" ADD CONSTRAINT "backup_snapshots_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_media_assets_pending_idx" ON "backup_media_assets" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "backup_outbox_pending_idx" ON "backup_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "backup_outbox_revision_idx" ON "backup_outbox" USING btree ("revision");--> statement-breakpoint
CREATE INDEX "backup_snapshot_media_sha_idx" ON "backup_snapshot_media" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "backup_snapshots_status_idx" ON "backup_snapshots" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "backup_snapshots_ready_idx" ON "backup_snapshots" USING btree ("completed_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION herboverflow_backup_outbox_capture() RETURNS trigger AS $$
DECLARE
  row_data jsonb;
  entity_key text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  entity_key := COALESCE(row_data->>'id', row_data->>'drug_id', row_data->>'collection_id', row_data->>'crude_drug_id', row_data->>'media_asset_id', row_data->>'key');
  INSERT INTO backup_outbox (table_name, operation, entity_id) VALUES (TG_TABLE_NAME, TG_OP, entity_key);

  IF TG_TABLE_NAME = 'media_assets' AND TG_OP <> 'DELETE' THEN
    INSERT INTO backup_media_assets (media_asset_id, status, available_at, updated_at)
    VALUES ((row_data->>'id')::uuid, 'pending', now(), now())
    ON CONFLICT (media_asset_id) DO UPDATE SET status='pending', available_at=now(), claimed_at=NULL, last_error=NULL, updated_at=now();
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE
  tracked_table text;
BEGIN
  FOREACH tracked_table IN ARRAY ARRAY[
    'categories','families','crude_drugs','field_definitions','drug_identity_terms','crude_drug_identity_terms',
    'relationship_types','crude_drug_relationships','constituents','constituent_taxa','constituent_taxon_edges',
    'constituent_memberships','crude_drug_constituents','constituent_media','constituent_taxon_media',
    'user_drug_mnemonics','user_mnemonic_preferences','legacy_drug_mnemonics','collections','collection_members',
    'collection_revisions','decks','word_cards','concept_anchors','concept_connections','media_assets','app_settings',
    'archive_groups','archive_entries','user'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION herboverflow_backup_outbox_capture()', 'backup_outbox_' || tracked_table, tracked_table);
  END LOOP;
END $$;
--> statement-breakpoint
INSERT INTO backup_media_assets (media_asset_id, status)
SELECT id, 'pending' FROM media_assets ON CONFLICT (media_asset_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO backup_outbox (table_name, operation, entity_id) VALUES ('system', 'RECONCILE', 'initial-backfill');
--> statement-breakpoint
INSERT INTO backup_worker_state (id, status) VALUES ('primary', 'idle') ON CONFLICT (id) DO NOTHING;
