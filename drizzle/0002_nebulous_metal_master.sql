CREATE TABLE "field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_definitions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD COLUMN "catalog_index" integer;--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD CONSTRAINT "crude_drugs_catalog_index_unique" UNIQUE("catalog_index");