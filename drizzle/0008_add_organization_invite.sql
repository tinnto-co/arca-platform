CREATE TYPE "public"."organization_invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint

CREATE TABLE "organization_invite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" "public"."organization_role" NOT NULL,
  "token" text NOT NULL,
  "status" "public"."organization_invite_status" DEFAULT 'pending' NOT NULL,
  "invited_by_user_id" text,
  "accepted_by_user_id" text,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "organization_invite"
  ADD CONSTRAINT "organization_invite_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "organization_invite"
  ADD CONSTRAINT "organization_invite_invited_by_user_id_user_id_fk"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "organization_invite"
  ADD CONSTRAINT "organization_invite_accepted_by_user_id_user_id_fk"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "organization_invite"
  ADD CONSTRAINT "organization_invite_token_unique" UNIQUE("token");--> statement-breakpoint

ALTER TABLE "organization_invite"
  ADD CONSTRAINT "organization_invite_org_email_status_unique"
  UNIQUE("organization_id", "email", "status");--> statement-breakpoint

