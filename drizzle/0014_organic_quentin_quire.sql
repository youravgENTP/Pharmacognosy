CREATE TABLE "archive_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_group_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"original_index" integer NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_by" text
);
--> statement-breakpoint
CREATE TABLE "archive_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_archive_group_id_archive_groups_id_fk" FOREIGN KEY ("archive_group_id") REFERENCES "public"."archive_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_groups" ADD CONSTRAINT "archive_groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archive_entries_drug_idx" ON "archive_entries" USING btree ("drug_id");--> statement-breakpoint
CREATE UNIQUE INDEX "archive_entries_group_drug_idx" ON "archive_entries" USING btree ("archive_group_id","drug_id");--> statement-breakpoint
CREATE UNIQUE INDEX "archive_entries_group_index_idx" ON "archive_entries" USING btree ("archive_group_id","original_index");--> statement-breakpoint
CREATE INDEX "archive_entries_group_idx" ON "archive_entries" USING btree ("archive_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "archive_groups_name_idx" ON "archive_groups" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "archive_groups_prefix_idx" ON "archive_groups" USING btree ("prefix");