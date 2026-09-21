-- Qué tutoriales ya vio (o salteó) cada usuario.
--
-- La primera vez que alguien entra a un módulo con tutorial, el tutorial se
-- abre solo y no se cierra hasta terminarlo u omitirlo. Para no volver a
-- abrirlo hay que recordar que ya pasó, y eso es de la persona, no del
-- navegador: quien lo vio en la oficina no tiene que verlo de nuevo en casa.
CREATE TABLE IF NOT EXISTS "usuario_tutorial" (
	"user_id" text NOT NULL,
	"tutorial" text NOT NULL,
	"estado" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_tutorial_pkey" PRIMARY KEY ("user_id","tutorial"),
	CONSTRAINT "usuario_tutorial_estado_check" CHECK ("estado" IN ('completado', 'omitido'))
);
--> statement-breakpoint
ALTER TABLE "usuario_tutorial" ADD CONSTRAINT "usuario_tutorial_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Sin RLS a propósito: es del usuario, no de una organización. Las server
-- functions filtran siempre por el usuario de la sesión.
GRANT SELECT, INSERT, UPDATE ON TABLE "usuario_tutorial" TO "arca_app";
