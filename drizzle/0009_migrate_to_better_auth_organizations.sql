-- Migration: Replace custom organization tables with Better Auth organization plugin tables
-- This migration drops the custom org tables (no production data) and creates Better Auth's tables.

-- 1. Drop custom org tables and enums (order matters for FK deps)
DROP TABLE IF EXISTS "organization_invite" CASCADE;
DROP TABLE IF EXISTS "organization_user" CASCADE;

-- 2. Drop the old organization table (UUID-based, will be replaced by text-based)
-- First remove the FK from client
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "client_organization_id_organization_id_fk";
ALTER TABLE "client" DROP COLUMN IF EXISTS "organization_id";
DROP TABLE IF EXISTS "organization" CASCADE;

-- 3. Drop custom enums
DROP TYPE IF EXISTS "organization_role";
DROP TYPE IF EXISTS "organization_invite_status";

-- 4. Create Better Auth organization tables (text IDs)
CREATE TABLE IF NOT EXISTS "organization" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text UNIQUE,
  "logo" text,
  "metadata" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "member" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text,
  "status" text NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 5. Add activeOrganizationId to session
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "active_organization_id" text;

-- 6. Re-add organization_id to client as text (NOT NULL after data migration)
ALTER TABLE "client" ADD COLUMN "organization_id" text;

-- NOTE: After running the data migration (0010), run:
-- ALTER TABLE "client" ALTER COLUMN "organization_id" SET NOT NULL;
-- ALTER TABLE "client" ADD CONSTRAINT "client_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
