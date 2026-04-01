-- Crear organización "Caravelle studio" con el mismo owner que Estudio BLAKG (estudioblakg@gmail.com).
-- Ejecutar contra la misma base que usa arca-platform (psql, pgAdmin, o script con postgres).
-- Idempotente: ON CONFLICT no duplica filas si ya existen.
--
-- No modifica clientes: los existentes siguen en su organization_id actual.
-- Tras esto, el usuario puede cambiar a esta org desde el selector (OrgSwitcher) en la app.

INSERT INTO "organization" ("id", "name", "slug", "created_at")
VALUES (
  'org_caravelle_studio',
  'Caravelle studio',
  'caravelle-studio',
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
SELECT
  'member_caravelle_owner',
  'org_caravelle_studio',
  u."id",
  'owner',
  now()
FROM "user" u
WHERE u."email" = 'estudioblakg@gmail.com'
ON CONFLICT ("id") DO NOTHING;

-- Verificación (opcional):
-- SELECT * FROM "organization" WHERE "id" = 'org_caravelle_studio';
-- SELECT m.*, u."email" FROM "member" m JOIN "user" u ON u."id" = m."user_id" WHERE m."organization_id" = 'org_caravelle_studio';
-- Si el segundo SELECT no devuelve filas, el usuario con ese email no existe en "user".
