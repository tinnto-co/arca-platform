CREATE TYPE "public"."inflation_adjustment_status" AS ENUM('draft', 'applied');--> statement-breakpoint
CREATE TYPE "public"."inflation_index_source" AS ENUM('facpce_rt6', 'indec_ipc', 'manual');--> statement-breakpoint
-- El tipo se recrea en vez de sumarle valores con ALTER TYPE ... ADD VALUE.
-- Drizzle corre todas las migraciones pendientes en UNA transacción, y Postgres
-- no deja usar un valor de enum agregado en esa misma transacción sin commitear
-- («unsafe use of new value»). La 0020 usa dos de estos valores, así que con
-- ADD VALUE la corrida fallaba entera en cualquier entorno que viniera de la
-- 0016 o anterior. Un tipo creado dentro de la transacción sí puede usarse.
--
-- Es seguro porque el enum lo usa una sola columna, sin default ni índices, y
-- el orden de los valores queda igual que con los ADD VALUE.
ALTER TYPE "public"."account_inflation_nature" RENAME TO "account_inflation_nature_old";--> statement-breakpoint
CREATE TYPE "public"."account_inflation_nature" AS ENUM('monetaria', 'no_monetaria', 'no_monetaria_costo', 'no_monetaria_valor_corriente', 'resultado_por_diferencia');--> statement-breakpoint
ALTER TABLE "accounting_account" ALTER COLUMN "inflation_nature" TYPE "public"."account_inflation_nature" USING "inflation_nature"::text::"public"."account_inflation_nature";--> statement-breakpoint
DROP TYPE "public"."account_inflation_nature_old";--> statement-breakpoint
ALTER TYPE "public"."journal_entry_origin" ADD VALUE 'auto_inflation' BEFORE 'import_excel';--> statement-breakpoint
CREATE TABLE "inflation_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"source" "inflation_index_source" DEFAULT 'facpce_rt6' NOT NULL,
	"closing_year" integer NOT NULL,
	"closing_month" integer NOT NULL,
	"opening_year" integer NOT NULL,
	"opening_month" integer NOT NULL,
	"status" "inflation_adjustment_status" DEFAULT 'draft' NOT NULL,
	"recpam_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"journal_entry_id" uuid,
	"applied_at" timestamp,
	"applied_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inflation_adjustment_fiscal_year_unique" UNIQUE("fiscal_year_id")
);
--> statement-breakpoint
CREATE TABLE "inflation_adjustment_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"year" integer,
	"month" integer,
	"is_opening" boolean DEFAULT false NOT NULL,
	"historical" numeric(18, 2) NOT NULL,
	"coefficient" numeric(10, 4) NOT NULL,
	"adjusted" numeric(18, 2) NOT NULL,
	"difference" numeric(18, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inflation_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "inflation_index_source" DEFAULT 'facpce_rt6' NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inflation_index_source_year_month_unique" UNIQUE("source","year","month")
);
--> statement-breakpoint
ALTER TABLE "accounting_account" ADD COLUMN "inflation_target_id" uuid;--> statement-breakpoint
ALTER TABLE "inflation_adjustment" ADD CONSTRAINT "inflation_adjustment_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustment" ADD CONSTRAINT "inflation_adjustment_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustment" ADD CONSTRAINT "inflation_adjustment_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustment" ADD CONSTRAINT "inflation_adjustment_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustment_line" ADD CONSTRAINT "inflation_adjustment_line_adjustment_id_inflation_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inflation_adjustment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inflation_adjustment_line" ADD CONSTRAINT "inflation_adjustment_line_account_id_accounting_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inflation_adjustment_client" ON "inflation_adjustment" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_inflation_adjustment_line_adj" ON "inflation_adjustment_line" USING btree ("adjustment_id");--> statement-breakpoint
CREATE INDEX "idx_inflation_adjustment_line_account" ON "inflation_adjustment_line" USING btree ("adjustment_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_inflation_index_lookup" ON "inflation_index" USING btree ("source","year","month");--> statement-breakpoint
ALTER TABLE "accounting_account" ADD CONSTRAINT "account_inflation_target_id_fkey" FOREIGN KEY ("inflation_target_id") REFERENCES "public"."accounting_account"("id") ON DELETE set null ON UPDATE no action;