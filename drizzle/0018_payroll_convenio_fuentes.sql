CREATE TABLE "payroll_convenio_fuente" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "convenio_id" uuid NOT NULL REFERENCES "payroll_convenio"("id") ON DELETE cascade,
  "fuente" text NOT NULL,
  "detalle" text,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "payroll_convenio_fuente_convenio_id_fuente_unique" UNIQUE("convenio_id", "fuente")
);

-- Fuente AFIP para convenios cuyo CCT existe en la tabla scrapeada.
INSERT INTO "payroll_convenio_fuente" ("convenio_id", "fuente", "detalle", "last_synced_at")
SELECT DISTINCT
  pc."id",
  'AFIP',
  'Detectado por CCT en afip_empleadores_convenio',
  MAX(aec."updated_at")
FROM "payroll_convenio" pc
JOIN "profile" p ON p."client_id" = pc."client_id"
JOIN "afip_empleadores_convenio" aec ON aec."profile_id" = p."id"
WHERE
  COALESCE(pc."cct_codigo", '') <> ''
  AND regexp_replace(aec."cct", '.*?([0-9]{2,4}/[0-9]{2,4}).*', '\1') = pc."cct_codigo"
GROUP BY pc."id"
ON CONFLICT ("convenio_id", "fuente") DO NOTHING;

-- Fuentes históricas desde escalas.
INSERT INTO "payroll_convenio_fuente" ("convenio_id", "fuente", "detalle")
SELECT DISTINCT
  pcc."convenio_id",
  pe."fuente",
  'Migrado desde payroll_escala.fuente'
FROM "payroll_escala" pe
JOIN "payroll_convenio_categoria" pcc ON pcc."id" = pe."categoria_id"
WHERE COALESCE(trim(pe."fuente"), '') <> ''
ON CONFLICT ("convenio_id", "fuente") DO NOTHING;

-- Fallback para convenios sin fuente explícita.
INSERT INTO "payroll_convenio_fuente" ("convenio_id", "fuente", "detalle")
SELECT
  pc."id",
  'MANUAL',
  'Convenio sin fuente previa registrada'
FROM "payroll_convenio" pc
LEFT JOIN "payroll_convenio_fuente" pcf ON pcf."convenio_id" = pc."id"
WHERE pcf."id" IS NULL
ON CONFLICT ("convenio_id", "fuente") DO NOTHING;
