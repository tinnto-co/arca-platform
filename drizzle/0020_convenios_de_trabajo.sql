-- Catálogo global de convenios colectivos de trabajo
CREATE TABLE IF NOT EXISTS convenios_de_trabajo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cct         TEXT UNIQUE NOT NULL,
  nombre      TEXT NOT NULL,
  signatarios TEXT,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Poblar desde los datos scrapeados existentes en afip_empleadores_convenio
-- ON CONFLICT DO NOTHING por si se corre más de una vez
INSERT INTO convenios_de_trabajo (cct, nombre, signatarios)
SELECT DISTINCT ON (cct)
  cct,
  actividad  AS nombre,
  signatarios
FROM afip_empleadores_convenio
WHERE cct IS NOT NULL
ORDER BY cct, created_at ASC
ON CONFLICT (cct) DO NOTHING;
