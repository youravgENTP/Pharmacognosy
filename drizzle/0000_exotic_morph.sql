CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collection_members" (
	"collection_id" uuid NOT NULL,
	"crude_drug_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"notes" text,
	CONSTRAINT "collection_members_collection_id_crude_drug_id_pk" PRIMARY KEY("collection_id","crude_drug_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'manual' NOT NULL,
	"rule" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "constituents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "constituents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "crude_drug_constituents" (
	"crude_drug_id" uuid NOT NULL,
	"constituent_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "crude_drug_constituents_crude_drug_id_constituent_id_pk" PRIMARY KEY("crude_drug_id","constituent_id")
);
--> statement-breakpoint
CREATE TABLE "crude_drug_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "crude_drugs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"korean_name" text NOT NULL,
	"latin_name" text,
	"origin" text,
	"scientific_name" text,
	"medicinal_part" text,
	"category_id" uuid,
	"family_id" uuid,
	"importance" integer DEFAULT 1 NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"korean_name" text,
	"scientific_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "relationship_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "word_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"crude_drug_id" uuid,
	"collection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_crude_drug_id_crude_drugs_id_fk" FOREIGN KEY ("crude_drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_constituents" ADD CONSTRAINT "crude_drug_constituents_crude_drug_id_crude_drugs_id_fk" FOREIGN KEY ("crude_drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_constituents" ADD CONSTRAINT "crude_drug_constituents_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_relationships" ADD CONSTRAINT "crude_drug_relationships_source_id_crude_drugs_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_relationships" ADD CONSTRAINT "crude_drug_relationships_target_id_crude_drugs_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_relationships" ADD CONSTRAINT "crude_drug_relationships_type_id_relationship_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."relationship_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD CONSTRAINT "crude_drugs_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drugs" ADD CONSTRAINT "crude_drugs_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_cards" ADD CONSTRAINT "word_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_cards" ADD CONSTRAINT "word_cards_crude_drug_id_crude_drugs_id_fk" FOREIGN KEY ("crude_drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_cards" ADD CONSTRAINT "word_cards_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crude_drugs_category_idx" ON "crude_drugs" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crude_drugs_korean_name_idx" ON "crude_drugs" USING btree ("korean_name");--> statement-breakpoint
CREATE UNIQUE INDEX "families_scientific_name_idx" ON "families" USING btree ("scientific_name");