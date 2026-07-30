CREATE TABLE "payroll_liquidacion_cierre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"journal_entry_id" uuid,
	"recibos" integer DEFAULT 0 NOT NULL,
	"conceptos_sin_regla" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp DEFAULT now() NOT NULL,
	"closed_by" text,
	"reopened_at" timestamp,
	"reopened_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_liquidacion_cierre" ADD CONSTRAINT "payroll_liquidacion_cierre_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_liquidacion_cierre" ADD CONSTRAINT "payroll_liquidacion_cierre_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_liquidacion_cierre" ADD CONSTRAINT "payroll_liquidacion_cierre_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_liquidacion_cierre" ADD CONSTRAINT "payroll_liquidacion_cierre_reopened_by_user_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_liquidacion_cierre_client_periodo_unique" ON "payroll_liquidacion_cierre" USING btree ("client_id","periodo") WHERE reopened_at is null;--> statement-breakpoint
CREATE INDEX "idx_payroll_liquidacion_cierre_client" ON "payroll_liquidacion_cierre" USING btree ("client_id","periodo");