CREATE TABLE "payroll_lsd_presentacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"nro_presentacion" integer NOT NULL,
	"filename" text NOT NULL,
	"empleados" integer NOT NULL,
	"conceptos" integer NOT NULL,
	"contenido" text NOT NULL,
	"generado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_lsd_pres_profile_periodo_nro" UNIQUE("profile_id","periodo","nro_presentacion")
);
--> statement-breakpoint
ALTER TABLE "payroll_lsd_presentacion" ADD CONSTRAINT "payroll_lsd_presentacion_profile_id_client_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;