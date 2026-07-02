ALTER TYPE "public"."job_type" ADD VALUE 'batch';--> statement-breakpoint
CREATE TABLE "payroll_localidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_localidad_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_parametros_periodo" (
	"periodo" text PRIMARY KEY NOT NULL,
	"tope_maximo_imponible" numeric(14, 2) NOT NULL,
	"salario_minimo" numeric(14, 2),
	"fuente" text,
	"actualizado_por_cron" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_tipo_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_lsd" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_tipo_empresa_codigo_lsd_unique" UNIQUE("codigo_lsd")
);
--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-06-11 18:09:27.578';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-06-11 18:09:27.577';--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "payroll_plantilla_empleado_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "tipo_empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "seguro_colectivo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "mipyme" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "orden_cln" text;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD COLUMN "localidad_id" uuid;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "situacion_revista1_id" uuid;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "situacion_revista1_dia_inicio" integer;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "situacion_revista2_id" uuid;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "situacion_revista2_dia_inicio" integer;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "situacion_revista3_id" uuid;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "situacion_revista3_dia_inicio" integer;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "dias_trabajados" integer;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "horas_trabajadas" integer;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD COLUMN "importe_maternidad_art13" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payroll_convenio" ADD COLUMN "client_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_payroll_plantilla_empleado_id_liquidacion_import_empleado_id_fk" FOREIGN KEY ("payroll_plantilla_empleado_id") REFERENCES "public"."liquidacion_import_empleado"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_tipo_empresa_id_payroll_tipo_empresa_id_fk" FOREIGN KEY ("tipo_empresa_id") REFERENCES "public"."payroll_tipo_empresa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_localidad_id_payroll_localidad_id_fk" FOREIGN KEY ("localidad_id") REFERENCES "public"."payroll_localidad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD CONSTRAINT "liquidacion_import_recibo_situacion_revista1_id_payroll_situacion_id_fk" FOREIGN KEY ("situacion_revista1_id") REFERENCES "public"."payroll_situacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD CONSTRAINT "liquidacion_import_recibo_situacion_revista2_id_payroll_situacion_id_fk" FOREIGN KEY ("situacion_revista2_id") REFERENCES "public"."payroll_situacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD CONSTRAINT "liquidacion_import_recibo_situacion_revista3_id_payroll_situacion_id_fk" FOREIGN KEY ("situacion_revista3_id") REFERENCES "public"."payroll_situacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_convenio" ADD CONSTRAINT "payroll_convenio_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" DROP COLUMN "tipo_empleador";--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" DROP COLUMN "situacion_revista";--> statement-breakpoint
DROP TYPE "public"."payroll_situacion_revista";--> statement-breakpoint
DROP TYPE "public"."payroll_tipo_empleador";