ALTER TABLE "fiscal_entity" ADD COLUMN "direccion" text;--> statement-breakpoint
ALTER TABLE "fiscal_entity" ADD COLUMN "cod_postal" text;--> statement-breakpoint
ALTER TABLE "fiscal_entity" ADD COLUMN "province_source" text;--> statement-breakpoint
ALTER TABLE "fiscal_entity" ADD COLUMN "province_fetched_at" timestamp;--> statement-breakpoint
-- Backfill: los datos existentes provienen de Nosis; fecha del dato = updated_at
UPDATE "fiscal_entity" SET "province_source" = 'nosis', "province_fetched_at" = "updated_at" WHERE "province" IS NOT NULL;