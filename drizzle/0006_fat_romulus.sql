CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'failed', 'finished');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('iva', 'comprobantes', 'comprobantes_full', 'notificaciones', 'deuda');--> statement-breakpoint
CREATE TABLE "fiscal_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuil_cuit" text NOT NULL,
	"name" text NOT NULL,
	"province" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_entity_cuil_cuit_unique" UNIQUE("cuil_cuit")
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"type" "job_type" NOT NULL,
	"client_id" uuid NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb,
	"failed_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"failed_at" timestamp,
	"bull_job_id" text,
	"attempts" integer DEFAULT 0,
	"progress" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-03-06 13:38:03.694';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-03-06 13:38:03.693';--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "receipt_province" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "opened" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;