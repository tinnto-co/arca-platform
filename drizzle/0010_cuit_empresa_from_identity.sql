-- Personas físicas (y cualquier cliente sin CUIT de razón social cargado): unificar en cuit_empresa el mismo CUIT/CUIL que identity_number
UPDATE "client"
SET
  "cuit_empresa" = "identity_number",
  "updated_at" = NOW()
WHERE
  (COALESCE(TRIM("cuit_empresa"), '') = '')
  AND COALESCE(TRIM("identity_number"), '') <> '';
