CREATE TYPE "public"."fixed_asset_category" AS ENUM('rodados', 'muebles_utiles', 'equipos_computacion', 'instalaciones', 'inmuebles', 'maquinarias', 'otros');--> statement-breakpoint
CREATE TYPE "public"."fixed_asset_disposal_reason" AS ENUM('sale', 'disuse', 'destruction');--> statement-breakpoint
CREATE TYPE "public"."fixed_asset_method" AS ENUM('linear');--> statement-breakpoint
CREATE TYPE "public"."fixed_asset_status" AS ENUM('active', 'sold', 'discarded');--> statement-breakpoint
CREATE TABLE "fixed_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "fixed_asset_category" NOT NULL,
	"asset_account_id" uuid NOT NULL,
	"accum_depr_account_id" uuid NOT NULL,
	"depr_expense_account_id" uuid NOT NULL,
	"acquisition_date" timestamp NOT NULL,
	"original_value" numeric(18, 2) NOT NULL,
	"useful_life_years" integer NOT NULL,
	"residual_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"method" "fixed_asset_method" DEFAULT 'linear' NOT NULL,
	"status" "fixed_asset_status" DEFAULT 'active' NOT NULL,
	"disposal_date" timestamp,
	"disposal_reason" "fixed_asset_disposal_reason",
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_asset_account_id_accounting_account_id_fk" FOREIGN KEY ("asset_account_id") REFERENCES "public"."accounting_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_accum_depr_account_id_accounting_account_id_fk" FOREIGN KEY ("accum_depr_account_id") REFERENCES "public"."accounting_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_depr_expense_account_id_accounting_account_id_fk" FOREIGN KEY ("depr_expense_account_id") REFERENCES "public"."accounting_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fixed_asset_client_status" ON "fixed_asset" USING btree ("client_id","status");