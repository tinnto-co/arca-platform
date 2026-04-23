-- Catálogo de obras sociales y cabecera extendida de liquidación / recibo
CREATE TABLE IF NOT EXISTS "obra_social" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "obra_social_codigo_unique" UNIQUE("codigo")
);

ALTER TABLE "payroll_employee" ADD COLUMN IF NOT EXISTS "legajo" text;

ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "tipo_recibo" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "quincena" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "fecha_liquidacion" timestamp;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "obra_social_id" uuid;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "fecha_pago" timestamp;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "lugar_pago" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "forma_pago" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "cbu" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "banco" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "periodo_cargas" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "fecha_deposito_cargas" timestamp;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "observacion_interna" text;
ALTER TABLE "payroll_liquidacion" ADD COLUMN IF NOT EXISTS "observacion_recibo" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_liquidacion_obra_social_id_obra_social_id_fk'
  ) THEN
    ALTER TABLE "payroll_liquidacion"
      ADD CONSTRAINT "payroll_liquidacion_obra_social_id_obra_social_id_fk"
      FOREIGN KEY ("obra_social_id") REFERENCES "public"."obra_social"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
