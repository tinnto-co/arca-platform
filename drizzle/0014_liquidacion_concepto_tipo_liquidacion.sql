-- Tipo de concepto por línea (motor de liquidación) para columnas del recibo
ALTER TABLE "liquidacion_import_concepto_valor" ADD COLUMN IF NOT EXISTS "tipo_liquidacion" text;
