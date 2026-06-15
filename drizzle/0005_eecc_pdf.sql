ALTER TABLE "financial_statement" ADD COLUMN "pdf_url" text;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD COLUMN "pdf_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD COLUMN "pdf_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD COLUMN "pdf_generated_by" text;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD CONSTRAINT "financial_statement_pdf_generated_by_user_id_fk" FOREIGN KEY ("pdf_generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;