CREATE TABLE IF NOT EXISTS "notificacion_categoria_prioridad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"categoria" text NOT NULL,
	"severidad" "notificacion_severidad" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificacion_categoria_prioridad_org_id_categoria_key" UNIQUE("org_id","categoria")
);
--> statement-breakpoint
ALTER TABLE "notificacion_categoria_prioridad" ADD CONSTRAINT "notificacion_categoria_prioridad_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notificacion_categoria_prioridad" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant" ON "notificacion_categoria_prioridad" AS PERMISSIVE FOR ALL TO "arca_agent", "arca_app" USING ((org_id = current_setting('app.org_id'::text, true))) WITH CHECK ((org_id = current_setting('app.org_id'::text, true)));
