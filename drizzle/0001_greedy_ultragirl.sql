CREATE TABLE "constituent_memberships" (
	"constituent_id" uuid NOT NULL,
	"taxon_id" uuid NOT NULL,
	CONSTRAINT "constituent_memberships_constituent_id_taxon_id_pk" PRIMARY KEY("constituent_id","taxon_id")
);
--> statement-breakpoint
CREATE TABLE "constituent_taxa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'class' NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "constituent_taxon_edges" (
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "constituent_taxon_edges_parent_id_child_id_pk" PRIMARY KEY("parent_id","child_id")
);
--> statement-breakpoint
ALTER TABLE "crude_drugs" ALTER COLUMN "importance" SET DATA TYPE text;--> statement-breakpoint
UPDATE "crude_drugs" SET "importance" = CASE
	WHEN "importance" IN ('4', '3') THEN '중요'
	WHEN "importance" = '2' THEN '중간'
	WHEN "importance" = '1' THEN '비중요'
	ELSE '중간'
END;--> statement-breakpoint
ALTER TABLE "crude_drugs" ALTER COLUMN "importance" SET DEFAULT '중간';--> statement-breakpoint
ALTER TABLE "constituent_memberships" ADD CONSTRAINT "constituent_memberships_constituent_id_constituents_id_fk" FOREIGN KEY ("constituent_id") REFERENCES "public"."constituents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_memberships" ADD CONSTRAINT "constituent_memberships_taxon_id_constituent_taxa_id_fk" FOREIGN KEY ("taxon_id") REFERENCES "public"."constituent_taxa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_taxon_edges" ADD CONSTRAINT "constituent_taxon_edges_parent_id_constituent_taxa_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."constituent_taxa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constituent_taxon_edges" ADD CONSTRAINT "constituent_taxon_edges_child_id_constituent_taxa_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."constituent_taxa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "constituent_taxa_name_kind_idx" ON "constituent_taxa" USING btree ("name","kind");
