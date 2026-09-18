ALTER TABLE "families" ALTER COLUMN "korean_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "accepted_scientific_name" text;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "summary" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;