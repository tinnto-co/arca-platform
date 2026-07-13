CREATE TYPE "public"."financial_statement_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TABLE "financial_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"status" "financial_statement_status" DEFAULT 'draft' NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_at" timestamp,
	"approved_by" text,
	"pdf_url" text,
	"pdf_size_bytes" integer,
	"pdf_generated_at" timestamp,
	"pdf_generated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_statement_fy_unique" UNIQUE("fiscal_year_id")
);
--> statement-breakpoint
ALTER TABLE "financial_statement" ADD CONSTRAINT "financial_statement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD CONSTRAINT "financial_statement_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD CONSTRAINT "financial_statement_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD CONSTRAINT "financial_statement_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_statement" ADD CONSTRAINT "financial_statement_pdf_generated_by_user_id_fk" FOREIGN KEY ("pdf_generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_financial_statement_client" ON "financial_statement" USING btree ("client_id");