ALTER TABLE "crude_drugs" ADD COLUMN "origins" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "input_mode" text DEFAULT 'hierarchy4' NOT NULL;--> statement-breakpoint
UPDATE "crude_drugs" SET "importance" = '비중요' WHERE "importance" = '연관';--> statement-breakpoint
UPDATE "field_definitions" SET "input_mode" = 'hierarchy3' WHERE "name" IN ('확인시험', '규격시험·정량·기준');
