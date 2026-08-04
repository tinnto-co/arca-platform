-- Informe del auditor: plantillas por estudio y el informe rellenado por balance.
CREATE TABLE "audit_report_template" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "body" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "idx_audit_report_template_org" ON "audit_report_template" ("organization_id");

-- Nullable: un balance sin informe cargado es lo normal hasta que se emite.
ALTER TABLE "financial_statement" ADD COLUMN "audit_report" jsonb;
