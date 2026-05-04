ALTER TABLE "profile"
ADD COLUMN IF NOT EXISTS "usa_lsd_referencia" boolean NOT NULL DEFAULT false;

UPDATE "profile" p
SET "usa_lsd_referencia" = true
WHERE EXISTS (
  SELECT 1
  FROM "liquidacion_import_empleado" e
  JOIN "liquidacion_import_recibo" r ON r."empleado_id" = e."id"
  WHERE e."profile_id" = p."id"
    AND r."origen" = 'import'
);
