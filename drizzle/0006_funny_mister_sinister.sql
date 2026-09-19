CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"original_filename" text,
	"size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_blob_pathname_unique" UNIQUE("blob_pathname")
);
--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD COLUMN "reference_index" integer;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "summary_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD CONSTRAINT "crude_drugs_reference_index_unique" UNIQUE("reference_index");--> statement-breakpoint
INSERT INTO "categories" ("name", "slug", "position") VALUES ('시험범위 외 참고류', 'reference', 99) ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "position" = EXCLUDED."position";--> statement-breakpoint
INSERT INTO "relationship_types" ("name") VALUES ('연관생약'), ('유사생약') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "crude_drug_relationships" SET "type_id" = (SELECT "id" FROM "relationship_types" WHERE "name" = '연관생약') WHERE "type_id" IN (SELECT "id" FROM "relationship_types" WHERE "name" IN ('연관', '가공/연관'));
