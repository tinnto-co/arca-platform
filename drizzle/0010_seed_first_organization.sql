-- Data migration: Create the first organization and migrate existing data.
-- Run AFTER 0009_migrate_to_better_auth_organizations.sql

-- 1. Create the first organization for Estudio BLAKG
INSERT INTO "organization" ("id", "name", "slug", "created_at")
VALUES (
  'org_estudio_blakg',
  'Estudio BLAKG',
  'estudio-blakg',
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- 2. Create a member record for estudioblakg@gmail.com as owner
INSERT INTO "member" ("id", "organization_id", "user_id", "role", "created_at")
SELECT
  'member_blakg_owner',
  'org_estudio_blakg',
  u."id",
  'owner',
  now()
FROM "user" u
WHERE u."email" = 'estudioblakg@gmail.com'
ON CONFLICT ("id") DO NOTHING;

-- 3. Assign all existing clients to this organization
UPDATE "client"
SET "organization_id" = 'org_estudio_blakg'
WHERE "organization_id" IS NULL;

-- 4. Now that all clients have an org, make the column NOT NULL and add FK
ALTER TABLE "client" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "client" ADD CONSTRAINT "client_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
