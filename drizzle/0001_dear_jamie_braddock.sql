CREATE TYPE "public"."account_cash_flow_activity" AS ENUM('operating', 'investing', 'financing');--> statement-breakpoint
CREATE TYPE "public"."account_expected_balance" AS ENUM('debit', 'credit', 'both');--> statement-breakpoint
CREATE TYPE "public"."account_expense_function" AS ENUM('administration', 'sales', 'financial', 'other');--> statement-breakpoint
CREATE TYPE "public"."account_group" AS ENUM('caja_bancos', 'inversiones_temporarias', 'creditos_ventas', 'otros_creditos_cte', 'bienes_cambio', 'otros_activos_cte', 'creditos_largo_plazo', 'bienes_uso', 'intangibles', 'inversiones_permanentes', 'otros_activos_no_cte', 'deudas_comerciales', 'deudas_financieras', 'deudas_sociales', 'deudas_fiscales', 'otras_deudas_cte', 'deudas_largo_plazo', 'previsiones', 'capital', 'aportes_irrevocables', 'primas_emision', 'reservas', 'resultados_no_asignados', 'resultado_ejercicio', 'ventas', 'costo_ventas', 'gastos_administracion', 'gastos_comercializacion', 'gastos_financieros', 'otros_resultados_pos', 'otros_resultados_neg', 'impuesto_ganancias');--> statement-breakpoint
CREATE TYPE "public"."account_inflation_nature" AS ENUM('monetaria', 'no_monetaria');--> statement-breakpoint
CREATE TYPE "public"."account_scope" AS ENUM('base', 'custom');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('imputable', 'group');--> statement-breakpoint
CREATE TYPE "public"."accounting_log_event_type" AS ENUM('period_closed', 'period_reopened', 'fiscal_year_closed', 'fiscal_year_reopened', 'journal_entry_created', 'journal_entry_edited', 'journal_entry_voided', 'account_created', 'account_deactivated', 'financial_statement_approved');--> statement-breakpoint
CREATE TYPE "public"."accounting_period_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."fiscal_year_status" AS ENUM('open', 'closing', 'closed');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_origin" AS ENUM('manual', 'auto_invoice', 'auto_payroll', 'auto_closing', 'auto_opening', 'import_excel');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_source_type" AS ENUM('invoice', 'payroll', 'closing');--> statement-breakpoint
CREATE TABLE "account_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"is_active" boolean,
	"custom_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_override_client_account_unique" UNIQUE("client_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "accounting_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"fiscal_year_id" uuid,
	"event_type" "accounting_log_event_type" NOT NULL,
	"event_data" jsonb,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "accounting_period_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp,
	"closed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_period_fy_year_month_unique" UNIQUE("fiscal_year_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "fiscal_year" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"status" "fiscal_year_status" DEFAULT 'open' NOT NULL,
	"number" integer NOT NULL,
	"closed_at" timestamp,
	"closed_by" text,
	"reopened_at" timestamp,
	"reopened_by" text,
	"reopen_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_year_client_number_unique" UNIQUE("client_id","number")
);
--> statement-breakpoint
ALTER TABLE "accounting_account" DROP CONSTRAINT "accounting_account_representative_id_code_unique";--> statement-breakpoint
ALTER TABLE "accounting_account" DROP CONSTRAINT "accounting_account_representative_id_representative_id_fk";
--> statement-breakpoint
ALTER TABLE "accounting_account" DROP CONSTRAINT "accounting_account_parent_id_fkey";
--> statement-breakpoint
ALTER TABLE "journal_entry" DROP CONSTRAINT "journal_entry_representative_id_representative_id_fk";
--> statement-breakpoint
ALTER TABLE "journal_entry" DROP CONSTRAINT "journal_entry_created_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "journal_entry" DROP CONSTRAINT "journal_entry_client_id_client_id_fk";
--> statement-breakpoint
ALTER TABLE "accounting_account" ALTER COLUMN "type" SET DATA TYPE "public"."account_type" USING "type"::"public"."account_type";--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-06-05 14:59:29.370';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-06-05 14:59:29.369';--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ALTER COLUMN "source_type" SET DATA TYPE "public"."journal_entry_source_type" USING "source_type"::"public"."journal_entry_source_type";--> statement-breakpoint
ALTER TABLE "journal_entry_line" ALTER COLUMN "debit" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "journal_entry_line" ALTER COLUMN "debit" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "journal_entry_line" ALTER COLUMN "credit" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "journal_entry_line" ALTER COLUMN "credit" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "scope" "account_scope" NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "account_group" "account_group";--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "expected_balance" "account_expected_balance";--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "expense_function" "account_expense_function";--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "inflation_nature" "account_inflation_nature";--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "cash_flow_activity" "account_cash_flow_activity";--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "is_system_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "fiscal_year_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "period_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "origin" "journal_entry_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "mapping_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "is_voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "is_edited_post_generation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD COLUMN "client_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD COLUMN "period_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD COLUMN "line_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account_override" ADD CONSTRAINT "account_override_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_override" ADD CONSTRAINT "account_override_account_id_accounting_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_log" ADD CONSTRAINT "accounting_log_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_log" ADD CONSTRAINT "accounting_log_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_log" ADD CONSTRAINT "accounting_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_period" ADD CONSTRAINT "accounting_period_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_period" ADD CONSTRAINT "accounting_period_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_period" ADD CONSTRAINT "accounting_period_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_year" ADD CONSTRAINT "fiscal_year_reopened_by_user_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounting_log_client" ON "accounting_log" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_accounting_period_client_fy" ON "accounting_period" USING btree ("client_id","fiscal_year_id");--> statement-breakpoint
CREATE INDEX "idx_fiscal_year_client" ON "fiscal_year" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "accounting_account" ADD CONSTRAINT "accounting_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD CONSTRAINT "accounting_account_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD CONSTRAINT "account_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."accounting_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_period_id_accounting_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_period_id_accounting_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_base_org_code_unique" ON "accounting_account" USING btree ("organization_id","code") WHERE scope = 'base';--> statement-breakpoint
CREATE UNIQUE INDEX "account_custom_client_code_unique" ON "accounting_account" USING btree ("client_id","code") WHERE scope = 'custom';--> statement-breakpoint
CREATE INDEX "idx_account_org_scope" ON "accounting_account" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE INDEX "idx_account_client" ON "accounting_account" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entry_client_fy" ON "journal_entry" USING btree ("client_id","fiscal_year_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entry_client_period_voided" ON "journal_entry" USING btree ("client_id","period_id","is_voided");--> statement-breakpoint
CREATE INDEX "idx_jel_client_account_period" ON "journal_entry_line" USING btree ("client_id","account_id","period_id");--> statement-breakpoint
CREATE INDEX "idx_jel_journal_entry" ON "journal_entry_line" USING btree ("journal_entry_id");--> statement-breakpoint
ALTER TABLE "accounting_account" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "accounting_account" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "journal_entry" DROP COLUMN "representative_id";--> statement-breakpoint
ALTER TABLE "journal_entry" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "journal_entry" DROP COLUMN "created_by_user_id";--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_client_fy_number_unique" UNIQUE("client_id","fiscal_year_id","number");