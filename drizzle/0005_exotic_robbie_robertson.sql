CREATE TABLE "iva_scrape" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"periodo_fiscal" text NOT NULL,
	"fecha_presentacion" text,
	"ok" boolean NOT NULL,
	"debito_fiscal" numeric(18, 2),
	"credito_fiscal" numeric(18, 2),
	"saldo_mes_pasado" numeric(18, 2),
	"saldo_arca_mes" numeric(18, 2),
	"saldo_tecnico_favor_contribuyente" numeric(18, 2),
	"saldo_tecnico_favor_contribuyente_posicion_mensual" numeric(18, 2),
	"saldo_libre_disponibilidad_periodo_anterior_neto" numeric(18, 2),
	"total_retenciones_percepciones_periodo" numeric(18, 2),
	"saldo_libre_disponibilidad_favor_contribuyente_periodo" numeric(18, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "iva_scrape_profile_periodo_unique" UNIQUE("profile_id","periodo_fiscal")
);
--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-01-29 22:20:54.309';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-01-29 22:20:54.300';--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "scraped_at" timestamp;--> statement-breakpoint
ALTER TABLE "iva_scrape" ADD CONSTRAINT "iva_scrape_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;