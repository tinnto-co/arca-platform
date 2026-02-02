CREATE TABLE "movements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"fecha" timestamp NOT NULL,
	"descripcion" text NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"tipo_gasto" text DEFAULT 'Sin especificar',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-01-26 13:54:41.592';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-01-26 13:54:41.592';--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;