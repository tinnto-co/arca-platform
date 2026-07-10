CREATE TABLE "accountant_signature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"nombre" text,
	"titulo" text DEFAULT 'Contador Público' NOT NULL,
	"universidad" text,
	"consejo" text,
	"tomo" text,
	"folio" text,
	"firma_imagen" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accountant_signature_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "actividad_principal" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "fecha_inscripcion" timestamp;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "numero_inscripcion" text;--> statement-breakpoint
ALTER TABLE "accountant_signature" ADD CONSTRAINT "accountant_signature_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;