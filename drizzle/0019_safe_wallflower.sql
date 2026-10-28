CREATE TABLE "data_card_backup_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"frozen_at" timestamp with time zone,
	"storage_key" text,
	"sha256" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_card_edit_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"drug_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_card_revisions" (
	"drug_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"saved_by" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_card_revisions_drug_id_revision_pk" PRIMARY KEY("drug_id","revision")
);
--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD COLUMN "data_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "data_card_backup_snapshots" ADD CONSTRAINT "data_card_backup_snapshots_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_card_edit_sessions" ADD CONSTRAINT "data_card_edit_sessions_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_card_edit_sessions" ADD CONSTRAINT "data_card_edit_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_card_revisions" ADD CONSTRAINT "data_card_revisions_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_card_revisions" ADD CONSTRAINT "data_card_revisions_saved_by_user_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_card_backup_snapshots_drug_revision_idx" ON "data_card_backup_snapshots" USING btree ("drug_id","revision");--> statement-breakpoint
CREATE INDEX "data_card_backup_snapshots_status_idx" ON "data_card_backup_snapshots" USING btree ("status","eligible_at");--> statement-breakpoint
CREATE INDEX "data_card_edit_sessions_drug_idx" ON "data_card_edit_sessions" USING btree ("drug_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "data_card_revisions_saved_idx" ON "data_card_revisions" USING btree ("drug_id","saved_at");--> statement-breakpoint
-- Data Card autosave must not synchronously enqueue backup_outbox work. All other
-- backup-relevant tables retain the 0017 trigger; Data Cards use version records
-- and periodic reconciliation below instead.
DROP TRIGGER IF EXISTS "backup_outbox_crude_drugs" ON "crude_drugs";--> statement-breakpoint
INSERT INTO "data_card_revisions" ("drug_id", "revision", "content", "saved_at")
SELECT "id", "data_revision", to_jsonb("crude_drugs"), "updated_at" FROM "crude_drugs"
ON CONFLICT ("drug_id", "revision") DO NOTHING;
