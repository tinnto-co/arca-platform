CREATE TABLE "cmv_annex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"existencia_inicial" numeric(18, 2) DEFAULT '0' NOT NULL,
	"compras_gastos" numeric(18, 2) DEFAULT '0' NOT NULL,
	"existencia_final" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cmv_annex_fy_unique" UNIQUE("fiscal_year_id")
);
--> statement-breakpoint
ALTER TABLE "cmv_annex" ADD CONSTRAINT "cmv_annex_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmv_annex" ADD CONSTRAINT "cmv_annex_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmv_annex" ADD CONSTRAINT "cmv_annex_fiscal_year_id_fiscal_year_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cmv_annex_client" ON "cmv_annex" USING btree ("client_id");