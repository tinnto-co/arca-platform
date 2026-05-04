-- 1. Agregar FK convenio_id a afip_empleadores_convenio
ALTER TABLE afip_empleadores_convenio
  ADD COLUMN IF NOT EXISTS convenio_id UUID REFERENCES convenios_de_trabajo(id) ON DELETE SET NULL;

-- 2. Poblar las filas existentes desde convenios_de_trabajo por match exacto de cct
UPDATE afip_empleadores_convenio aec
SET convenio_id = cdt.id
FROM convenios_de_trabajo cdt
WHERE aec.cct = cdt.cct
  AND aec.convenio_id IS NULL;

-- 3. Trigger: cuando el scraper inserta/actualiza en afip_empleadores_convenio,
--    hacer upsert en convenios_de_trabajo y setear convenio_id automáticamente.
CREATE OR REPLACE FUNCTION fn_sync_convenio_de_trabajo()
RETURNS TRIGGER AS $$
BEGIN
  -- Upsert en el catálogo: si el CCT no existe, lo crea.
  -- Si ya existe, NO lo pisa (el catálogo es la fuente de verdad).
  INSERT INTO convenios_de_trabajo (cct, nombre, signatarios)
  VALUES (NEW.cct, NEW.actividad, NEW.signatarios)
  ON CONFLICT (cct) DO NOTHING;

  -- Siempre sincronizar el FK en la fila de afip_empleadores_convenio
  SELECT id INTO NEW.convenio_id
  FROM convenios_de_trabajo
  WHERE cct = NEW.cct;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_convenio_de_trabajo ON afip_empleadores_convenio;

CREATE TRIGGER trg_sync_convenio_de_trabajo
BEFORE INSERT OR UPDATE OF cct ON afip_empleadores_convenio
FOR EACH ROW EXECUTE FUNCTION fn_sync_convenio_de_trabajo();
