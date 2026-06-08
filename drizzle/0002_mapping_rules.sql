CREATE TYPE "public"."ledger_mapping_amount_basis" AS ENUM('total', 'net', 'vat', 'other_taxes', 'concept_value', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."ledger_mapping_line_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_mapping_rule_type" AS ENUM('default', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."ledger_mapping_source_module" AS ENUM('invoice', 'payroll');--> statement-breakpoint
CREATE TABLE "ledger_mapping_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_module" "ledger_mapping_source_module" NOT NULL,
	"rule_type" "ledger_mapping_rule_type" DEFAULT 'default' NOT NULL,
	"condition" jsonb,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_mapping_rule_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"side" "ledger_mapping_line_side" NOT NULL,
	"amount_basis" "ledger_mapping_amount_basis" NOT NULL,
	"fixed_amount" numeric(18, 2),
	"line_order" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-06-08 09:26:12.273';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-06-08 09:26:12.273';--> statement-breakpoint
ALTER TABLE "ledger_mapping_rule" ADD CONSTRAINT "ledger_mapping_rule_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_mapping_rule_line" ADD CONSTRAINT "ledger_mapping_rule_line_rule_id_ledger_mapping_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."ledger_mapping_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_mapping_rule_line" ADD CONSTRAINT "ledger_mapping_rule_line_account_id_accounting_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ledger_mapping_rule_client" ON "ledger_mapping_rule" USING btree ("client_id","source_module");--> statement-breakpoint
CREATE INDEX "idx_ledger_mapping_rule_line_rule" ON "ledger_mapping_rule_line" USING btree ("rule_id");--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_mapping_rule_id_ledger_mapping_rule_id_fk" FOREIGN KEY ("mapping_rule_id") REFERENCES "public"."ledger_mapping_rule"("id") ON DELETE set null ON UPDATE no action;