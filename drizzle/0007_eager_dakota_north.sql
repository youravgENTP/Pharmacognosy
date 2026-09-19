CREATE TABLE "concept_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_ref" jsonb NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"status" text DEFAULT 'healthy' NOT NULL,
	"snapshot_text" text,
	"snapshot_hash" text,
	"asset_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anchor_a_id" uuid NOT NULL,
	"anchor_b_id" uuid NOT NULL,
	"color" text NOT NULL,
	"anchor_a_snapshot" jsonb NOT NULL,
	"anchor_b_snapshot" jsonb NOT NULL,
	"historical_a" boolean DEFAULT false NOT NULL,
	"historical_b" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "document" jsonb DEFAULT '{"version":1,"blocks":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_connections" ADD CONSTRAINT "concept_connections_anchor_a_id_concept_anchors_id_fk" FOREIGN KEY ("anchor_a_id") REFERENCES "public"."concept_anchors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_connections" ADD CONSTRAINT "concept_connections_anchor_b_id_concept_anchors_id_fk" FOREIGN KEY ("anchor_b_id") REFERENCES "public"."concept_anchors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_anchors_owner_idx" ON "concept_anchors" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "concept_anchors_target_idx" ON "concept_anchors" USING btree ("target_type");--> statement-breakpoint
CREATE UNIQUE INDEX "concept_connections_edge_idx" ON "concept_connections" USING btree ("anchor_a_id","anchor_b_id");--> statement-breakpoint
CREATE INDEX "concept_connections_anchor_a_idx" ON "concept_connections" USING btree ("anchor_a_id");--> statement-breakpoint
CREATE INDEX "concept_connections_anchor_b_idx" ON "concept_connections" USING btree ("anchor_b_id");