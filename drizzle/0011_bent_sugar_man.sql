CREATE TABLE "constituent_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"constituent_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "constituent_taxon_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxon_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crude_drug_identity_terms" (
	"crude_drug_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "crude_drug_identity_terms_crude_drug_id_term_id_pk" PRIMARY KEY("crude_drug_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "drug_identity_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "constituent_media" ADD CONSTRAINT "constituent_media_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_media" ADD CONSTRAINT "constituent_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_taxon_media" ADD CONSTRAINT "constituent_taxon_media_taxon_id_constituent_taxa_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."constituent_taxa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_taxon_media" ADD CONSTRAINT "constituent_taxon_media_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_identity_terms" ADD CONSTRAINT "crude_drug_identity_terms_crude_drug_id_crude_drugs_id_fk" FOREIGN KEY ("crude_drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crude_drug_identity_terms" ADD CONSTRAINT "crude_drug_identity_terms_term_id_drug_identity_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."drug_identity_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "constituent_media_asset_idx" ON "constituent_media" USING btree ("constituent_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "constituent_media_constituent_idx" ON "constituent_media" USING btree ("constituent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "constituent_taxon_media_asset_idx" ON "constituent_taxon_media" USING btree ("taxon_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "constituent_taxon_media_taxon_idx" ON "constituent_taxon_media" USING btree ("taxon_id");--> statement-breakpoint
CREATE INDEX "crude_drug_identity_terms_drug_idx" ON "crude_drug_identity_terms" USING btree ("crude_drug_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drug_identity_terms_name_idx" ON "drug_identity_terms" USING btree ("name");