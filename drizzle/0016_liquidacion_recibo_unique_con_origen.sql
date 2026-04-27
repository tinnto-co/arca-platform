ALTER TABLE "liquidacion_import_recibo"
DROP CONSTRAINT IF EXISTS "liquidacion_import_recibo_empleado_periodo_tipo_unique";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'liquidacion_import_recibo_empleado_periodo_tipo_origen_unique'
  ) THEN
    ALTER TABLE "liquidacion_import_recibo"
    ADD CONSTRAINT "liquidacion_import_recibo_empleado_periodo_tipo_origen_unique"
    UNIQUE ("empleado_id","periodo","tipo","origen");
  END IF;
END
$$;
