CREATE TABLE "collection_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"document" jsonb NOT NULL,
	"saved_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_revisions" ADD CONSTRAINT "collection_revisions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_revisions" ADD CONSTRAINT "collection_revisions_saved_by_user_id_user_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_revisions_collection_idx" ON "collection_revisions" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_revisions_collection_created_idx" ON "collection_revisions" USING btree ("collection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_revisions_collection_revision_idx" ON "collection_revisions" USING btree ("collection_id","revision");