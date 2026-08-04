ALTER TABLE "fiscal_year" ADD COLUMN "reference_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_year" ADD COLUMN "statements_adjusted" boolean DEFAULT true NOT NULL;