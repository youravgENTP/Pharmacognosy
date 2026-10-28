DROP INDEX "archive_entries_group_index_idx";--> statement-breakpoint
ALTER TABLE "archive_entries" ADD COLUMN "original_index_type" text DEFAULT 'catalog' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "archive_entries_group_index_idx" ON "archive_entries" USING btree ("archive_group_id","original_index_type","original_index");