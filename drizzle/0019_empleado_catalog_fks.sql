-- Agrega FKs a las tablas catálogo en liquidacion_import_empleado
-- y elimina los campos de texto redundantes (nombre/descripción).
-- Los campos codigo_* se conservan por ahora para auditoría.

ALTER TABLE liquidacion_import_empleado
  ADD COLUMN IF NOT EXISTS situacion_id        UUID REFERENCES payroll_situacion(id)              ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condicion_id        UUID REFERENCES payroll_condicion(id)              ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actividad_id        UUID REFERENCES payroll_actividad(id)              ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modalidad_contratacion_id UUID REFERENCES payroll_modalidad_contratacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS siniestrado_id      UUID REFERENCES payroll_siniestrado(id)            ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zona_id             UUID REFERENCES payroll_zona(id)                   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provincia_id        UUID REFERENCES payroll_provincia(id)              ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nacionalidad_id     UUID REFERENCES payroll_nacionalidad(id)           ON DELETE SET NULL;

-- Eliminar campos de texto redundantes (el nombre/descripción queda en el catálogo)
ALTER TABLE liquidacion_import_empleado
  DROP COLUMN IF EXISTS situacion,
  DROP COLUMN IF EXISTS condicion,
  DROP COLUMN IF EXISTS actividad,
  DROP COLUMN IF EXISTS siniestrado,
  DROP COLUMN IF EXISTS zona,
  DROP COLUMN IF EXISTS provincia,
  DROP COLUMN IF EXISTS nacionalidad;
