CREATE TABLE "legacy_drug_mnemonics" (
	"drug_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_drug_mnemonics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_drug_mnemonics" ADD CONSTRAINT "legacy_drug_mnemonics_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_drug_mnemonics" ADD CONSTRAINT "user_drug_mnemonics_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_drug_mnemonics" ADD CONSTRAINT "user_drug_mnemonics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_drug_mnemonics_drug_user_idx" ON "user_drug_mnemonics" USING btree ("drug_id","user_id");--> statement-breakpoint
CREATE INDEX "user_drug_mnemonics_drug_idx" ON "user_drug_mnemonics" USING btree ("drug_id");--> statement-breakpoint
CREATE INDEX "user_drug_mnemonics_user_idx" ON "user_drug_mnemonics" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "legacy_drug_mnemonics" ("drug_id", "items", "blocks")
SELECT
	"drug"."id",
	COALESCE("mnemonic"."section"->'items', '[]'::jsonb),
	COALESCE("mnemonic"."section"->'blocks', '[]'::jsonb)
FROM "crude_drugs" AS "drug"
CROSS JOIN LATERAL (
	SELECT "section"
	FROM jsonb_array_elements("drug"."sections") AS "section"
	LEFT JOIN "field_definitions" AS "field"
		ON "field"."id"::text = "section"->>'fieldDefinitionId'
	WHERE COALESCE("field"."name", "section"->>'title') = '암기법'
	LIMIT 1
) AS "mnemonic"
WHERE
	jsonb_array_length(COALESCE("mnemonic"."section"->'items', '[]'::jsonb)) > 0
	OR jsonb_array_length(COALESCE("mnemonic"."section"->'blocks', '[]'::jsonb)) > 0;
--> statement-breakpoint
UPDATE "concept_anchors" AS "anchor"
SET "status" = 'historical', "updated_at" = now()
FROM "crude_drugs" AS "drug", jsonb_array_elements("drug"."sections") AS "section"
WHERE
	"anchor"."owner_type" = 'drug'
	AND "anchor"."owner_id" = "drug"."id"
	AND "anchor"."target_ref"->>'sectionId' = "section"->>'id'
	AND COALESCE(
		(SELECT "field"."name" FROM "field_definitions" AS "field" WHERE "field"."id"::text = "section"->>'fieldDefinitionId' LIMIT 1),
		"section"->>'title'
	) = '암기법';
--> statement-breakpoint
UPDATE "crude_drugs" AS "drug"
SET "sections" = (
	SELECT jsonb_agg(
		CASE
			WHEN COALESCE("field"."name", "section"->>'title') = '암기법'
			THEN jsonb_set(jsonb_set("section", '{items}', '[]'::jsonb, true), '{blocks}', '[]'::jsonb, true)
			ELSE "section"
		END
	)
	FROM jsonb_array_elements("drug"."sections") AS "section"
	LEFT JOIN "field_definitions" AS "field"
		ON "field"."id"::text = "section"->>'fieldDefinitionId'
)
WHERE EXISTS (
	SELECT 1
	FROM jsonb_array_elements("drug"."sections") AS "section"
	LEFT JOIN "field_definitions" AS "field"
		ON "field"."id"::text = "section"->>'fieldDefinitionId'
	WHERE COALESCE("field"."name", "section"->>'title') = '암기법'
);
