-- Registro de los accesos del superadmin a estudios que no son suyos.
--
-- El acceso en sí se implementa como una fila en `member` con rol 'superadmin'
-- (Better Auth valida membresía antes de fijar la organización activa, y la
-- sesión vive en una cookie firmada que sólo su endpoint sabe refrescar). Esa
-- fila se borra al salir, así que no sirve como historial: para eso está esta
-- tabla, que sobrevive a la salida y responde "quién entró a qué estudio y
-- cuándo" sin depender de que el acceso siga abierto.
CREATE TABLE IF NOT EXISTS "superadmin_acceso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"entro_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salio_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "superadmin_acceso" ADD CONSTRAINT "superadmin_acceso_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "superadmin_acceso" ADD CONSTRAINT "superadmin_acceso_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Para "¿hay un acceso abierto de este usuario a este estudio?", que es la
-- consulta que corre en cada entrada y cada salida.
CREATE INDEX IF NOT EXISTS "idx_superadmin_acceso_abierto" ON "superadmin_acceso" USING btree ("user_id","organization_id") WHERE "salio_at" IS NULL;
--> statement-breakpoint
-- Sin RLS a propósito: es una bitácora de plataforma, no de una organización.
-- Las server functions que la leen ya exigen ser superadmin.
GRANT SELECT, INSERT, UPDATE ON TABLE "superadmin_acceso" TO "arca_app";
