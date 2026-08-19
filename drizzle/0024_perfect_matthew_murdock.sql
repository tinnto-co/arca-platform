CREATE TABLE "studio_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"tipo" text DEFAULT 'otro' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"asignado_a_user_id" text,
	"periodo_mes" text,
	"fecha_vencimiento" timestamp,
	"es_auto_generada" boolean DEFAULT false NOT NULL,
	"estado_changed_at" timestamp,
	"estado_changed_by_user_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_task_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"representative_id" uuid NOT NULL,
	"completado" boolean DEFAULT false NOT NULL,
	"completado_at" timestamp,
	"completado_by_user_id" text,
	CONSTRAINT "uq_studio_task_client" UNIQUE("task_id","representative_id")
);
--> statement-breakpoint
CREATE TABLE "studio_task_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"contenido" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_task" ADD CONSTRAINT "studio_task_asignado_a_user_id_user_id_fk" FOREIGN KEY ("asignado_a_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task" ADD CONSTRAINT "studio_task_estado_changed_by_user_id_user_id_fk" FOREIGN KEY ("estado_changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task" ADD CONSTRAINT "studio_task_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task_client" ADD CONSTRAINT "studio_task_client_task_id_studio_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."studio_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task_client" ADD CONSTRAINT "studio_task_client_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task_client" ADD CONSTRAINT "studio_task_client_completado_by_user_id_user_id_fk" FOREIGN KEY ("completado_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task_comment" ADD CONSTRAINT "studio_task_comment_task_id_studio_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."studio_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_task_comment" ADD CONSTRAINT "studio_task_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_studio_task_client_task" ON "studio_task_client" USING btree ("task_id");