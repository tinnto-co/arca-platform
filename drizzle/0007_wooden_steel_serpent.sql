CREATE TYPE "public"."payroll_concepto_base" AS ENUM('basico', 'bruto', 'total_remunerativo', 'total_no_remunerativo', 'total_descuentos', 'neto', 'fijo', 'custom');--> statement-breakpoint
CREATE TYPE "public"."payroll_concepto_tipo" AS ENUM('remunerativo', 'no_remunerativo', 'descuento');--> statement-breakpoint
CREATE TYPE "public"."payroll_tipo_jornada" AS ENUM('full_time', 'part_time', 'reducida');--> statement-breakpoint
ALTER TYPE "public"."job_type" ADD VALUE 'vencimientos';--> statement-breakpoint
CREATE TABLE "job_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "payroll_concepto_tipo" NOT NULL,
	"base_calculo" "payroll_concepto_base" DEFAULT 'basico' NOT NULL,
	"formula" text NOT NULL,
	"es_porcentaje" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"vigencia_desde" timestamp,
	"vigencia_hasta" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_convenio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_convenio_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"convenio_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_empleado_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empleado_id" uuid NOT NULL,
	"concepto_id" uuid NOT NULL,
	"valor_adicional" numeric(12, 2) DEFAULT '0',
	"vigencia_desde" timestamp,
	"vigencia_hasta" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_employee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"cuil_cuil" text NOT NULL,
	"fecha_ingreso" timestamp NOT NULL,
	"convenio_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL,
	"tipo_jornada" "payroll_tipo_jornada" DEFAULT 'full_time' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_escala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"vigencia_desde" timestamp NOT NULL,
	"vigencia_hasta" timestamp,
	"monto_basico" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_liquidacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empleado_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"basico" numeric(12, 2) NOT NULL,
	"total_remunerativo" numeric(12, 2) NOT NULL,
	"total_no_remunerativo" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_descuentos" numeric(12, 2) NOT NULL,
	"neto" numeric(12, 2) NOT NULL,
	"recibo_confirmado" boolean DEFAULT false NOT NULL,
	"calculado_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_liquidacion_detalle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"liquidacion_id" uuid NOT NULL,
	"concepto_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"cantidad" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_novedad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empleado_id" uuid NOT NULL,
	"concepto_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"cantidad" numeric(10, 2),
	"detalle" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "due_date" SET DEFAULT '2026-03-12 20:42:31.835';--> statement-breakpoint
ALTER TABLE "due_date" ALTER COLUMN "due_date" SET DEFAULT '2026-03-12 20:42:31.835';--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "has_errors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "error_message" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "liquida_sueldos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "convenio_multilateral" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "regimen_local" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "fiscal_condition" text;--> statement-breakpoint
ALTER TABLE "job_log" ADD CONSTRAINT "job_log_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_concepto" ADD CONSTRAINT "payroll_concepto_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_convenio" ADD CONSTRAINT "payroll_convenio_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_convenio_categoria" ADD CONSTRAINT "payroll_convenio_categoria_convenio_id_payroll_convenio_id_fk" FOREIGN KEY ("convenio_id") REFERENCES "public"."payroll_convenio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_empleado_concepto" ADD CONSTRAINT "payroll_empleado_concepto_empleado_id_payroll_employee_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_empleado_concepto" ADD CONSTRAINT "payroll_empleado_concepto_concepto_id_payroll_concepto_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."payroll_concepto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD CONSTRAINT "payroll_employee_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD CONSTRAINT "payroll_employee_convenio_id_payroll_convenio_id_fk" FOREIGN KEY ("convenio_id") REFERENCES "public"."payroll_convenio"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_employee" ADD CONSTRAINT "payroll_employee_categoria_id_payroll_convenio_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."payroll_convenio_categoria"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_escala" ADD CONSTRAINT "payroll_escala_categoria_id_payroll_convenio_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."payroll_convenio_categoria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_liquidacion" ADD CONSTRAINT "payroll_liquidacion_empleado_id_payroll_employee_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_liquidacion_detalle" ADD CONSTRAINT "payroll_liquidacion_detalle_liquidacion_id_payroll_liquidacion_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."payroll_liquidacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_liquidacion_detalle" ADD CONSTRAINT "payroll_liquidacion_detalle_concepto_id_payroll_concepto_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."payroll_concepto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_novedad" ADD CONSTRAINT "payroll_novedad_empleado_id_payroll_employee_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."payroll_employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_novedad" ADD CONSTRAINT "payroll_novedad_concepto_id_payroll_concepto_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."payroll_concepto"("id") ON DELETE cascade ON UPDATE no action;