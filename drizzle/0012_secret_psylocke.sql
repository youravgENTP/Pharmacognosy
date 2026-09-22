CREATE TABLE "user_mnemonic_preferences" (
	"user_id" text NOT NULL,
	"drug_id" uuid NOT NULL,
	"preferred_mnemonic_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_mnemonic_preferences_user_id_drug_id_pk" PRIMARY KEY("user_id","drug_id")
);
--> statement-breakpoint
ALTER TABLE "collections" ALTER COLUMN "kind" SET DEFAULT 'document';--> statement-breakpoint
UPDATE "collections" SET "kind" = 'document' WHERE "kind" = 'manual';--> statement-breakpoint
ALTER TABLE "user_mnemonic_preferences" ADD CONSTRAINT "user_mnemonic_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mnemonic_preferences" ADD CONSTRAINT "user_mnemonic_preferences_drug_id_crude_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."crude_drugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mnemonic_preferences" ADD CONSTRAINT "user_mnemonic_preferences_preferred_mnemonic_user_id_user_id_fk" FOREIGN KEY ("preferred_mnemonic_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_mnemonic_preferences_drug_idx" ON "user_mnemonic_preferences" USING btree ("drug_id");
