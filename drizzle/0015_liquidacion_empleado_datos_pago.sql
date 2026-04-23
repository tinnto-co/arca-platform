-- Datos de pago en el legajo (empleado) para completar recibos cuando la cabecera del período no los tiene
ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "lugar_pago" text;
ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "forma_pago" text;
ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "cbu" text;
ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "banco" text;
