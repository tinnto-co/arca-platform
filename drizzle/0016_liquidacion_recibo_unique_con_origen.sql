ALTER TABLE "liquidacion_import_recibo"
DROP CONSTRAINT IF EXISTS "liquidacion_import_recibo_empleado_periodo_tipo_unique";

ALTER TABLE "liquidacion_import_recibo"
ADD CONSTRAINT "liquidacion_import_recibo_empleado_periodo_tipo_origen_unique"
UNIQUE ("empleado_id","periodo","tipo","origen");
