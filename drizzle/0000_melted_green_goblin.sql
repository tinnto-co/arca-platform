CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'failed', 'finished');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('iva', 'comprobantes', 'comprobantes_full', 'notificaciones', 'deuda', 'vencimientos');--> statement-breakpoint
CREATE TYPE "public"."payroll_base_columna" AS ENUM('valHora', 'sueldoLegajo', 'sueldo', 'sub1_9', 'sub1_19', 'sub1_26', 'sub1_39', 'sub1_199', 'sub411_469', 'sub1_199_plus_411_469', 'importe_fijo', 'ref_concepto');--> statement-breakpoint
CREATE TYPE "public"."payroll_concepto_base" AS ENUM('basico', 'bruto', 'total_remunerativo', 'total_no_remunerativo', 'total_descuentos', 'neto', 'fijo', 'custom');--> statement-breakpoint
CREATE TYPE "public"."payroll_concepto_tipo" AS ENUM('remunerativo', 'no_remunerativo', 'descuento', 'retencion');--> statement-breakpoint
CREATE TYPE "public"."payroll_tipo_jornada" AS ENUM('full_time', 'part_time', 'reducida');--> statement-breakpoint
CREATE TYPE "public"."payroll_situacion_revista" AS ENUM('activo', 'licencia_enfermedad', 'licencia_maternidad', 'licencia_sin_goce', 'suspendido_con_goce', 'suspendido_sin_goce', 'vacaciones', 'accidente_trabajo', 'baja_despido', 'baja_fallecimiento', 'baja_otras', 'ilt_primeros_10', 'ilt_once_o_mas', 'reserva_puesto', 'excedencia', 'otro');--> statement-breakpoint
CREATE TYPE "public"."payroll_tipo_empleador" AS ENUM('dec814_inc_a', 'dec814_inc_b', 'dec814_inc_c');--> statement-breakpoint
CREATE TABLE "accounting_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_account_representative_id_code_unique" UNIQUE("representative_id","code")
);
--> statement-breakpoint
CREATE TABLE "afip_empleadores_convenio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"convenio_id" uuid,
	"cct" text NOT NULL,
	"actividad" text NOT NULL,
	"signatarios" text NOT NULL,
	"fecha_novedad" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "afip_empleadores_convenio_client_id_cct_unique" UNIQUE("client_id","cct")
);
--> statement-breakpoint
CREATE TABLE "agent_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Nueva conversación' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"tool_calls" jsonb,
	"citations" jsonb,
	"confidence" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"representative_id" uuid,
	"client_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"intent" text,
	"input" text NOT NULL,
	"output" text,
	"tool_trace" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"representative_id" uuid,
	"client_id" uuid,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_entity_type" text,
	"source_entity_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" text,
	"due_at" timestamp,
	"resolved_at" timestamp,
	"resolved_by_user_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"client_id" uuid,
	"bank_name" text NOT NULL,
	"account_number" text,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"alias" text,
	"cbu" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_invoice_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_transaction_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"match_type" text NOT NULL,
	"confidence" numeric(5, 2),
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"direction" text NOT NULL,
	"counterparty_name" text,
	"counterparty_identity_number" text,
	"external_id" text,
	"raw_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid,
	"name" text NOT NULL,
	"identity_number" text NOT NULL,
	"identity_type" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"liquida_sueldos" boolean DEFAULT false NOT NULL,
	"usa_lsd_referencia" boolean DEFAULT false NOT NULL,
	"scraped_at" timestamp,
	"firma_digital_empleador" text,
	"managed_by_study" boolean DEFAULT true NOT NULL,
	"disabled_at" timestamp,
	"disabled_reason" text,
	"profile_type" text DEFAULT 'unknown' NOT NULL,
	"afip_contribuyente_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_risk_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"period" text NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"risk_level" text NOT NULL,
	"factors" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_risk_snapshot_client_id_period_unique" UNIQUE("client_id","period")
);
--> statement-breakpoint
CREATE TABLE "concepto_sos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_afip" text NOT NULL,
	"concepto_afip_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concepto_sos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "concepto_sos_client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concepto_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concepto_sos_client_concepto_client_unique" UNIQUE("concepto_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "conceptos_completos_sos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_sos" integer NOT NULL,
	"codigo_afip" text,
	"nombre" text NOT NULL,
	"tiene_memo" boolean DEFAULT false,
	"tiene_cantidad" boolean DEFAULT false,
	"tiene_pct" boolean DEFAULT false,
	"tiene_imp_concepto_nro" boolean DEFAULT false,
	"tiene_importe" boolean DEFAULT false,
	"tiene_imp_min" boolean DEFAULT false,
	"tiene_imp_max" boolean DEFAULT false,
	"base_columna" text,
	"div_hs_norm" integer DEFAULT 1,
	"div_cantidad" integer DEFAULT 1,
	"pct_fijo" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conceptos_completos_sos_numero_sos_unique" UNIQUE("numero_sos")
);
--> statement-breakpoint
CREATE TABLE "convenios_de_trabajo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cct" text NOT NULL,
	"nombre" text NOT NULL,
	"signatarios" text,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "convenios_de_trabajo_cct_unique" UNIQUE("cct")
);
--> statement-breakpoint
CREATE TABLE "data_source_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"representative_id" uuid,
	"client_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"source" text NOT NULL,
	"source_job_id" uuid,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"client_id" uuid,
	"establishment" text DEFAULT '' NOT NULL,
	"tax" text DEFAULT '' NOT NULL,
	"concept" text DEFAULT '' NOT NULL,
	"sub_concept" text DEFAULT '' NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"quota_number" numeric DEFAULT '0' NOT NULL,
	"due_date" timestamp DEFAULT '2026-05-21 13:56:53.242' NOT NULL,
	"balance" numeric DEFAULT '0' NOT NULL,
	"compensatory_interest" numeric DEFAULT '0' NOT NULL,
	"punitive_interest" numeric DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"source_period" text,
	"is_intimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"storage_provider" text DEFAULT 'external' NOT NULL,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" integer,
	"checksum" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "due_date" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid,
	"client_id" uuid,
	"tax" text DEFAULT '' NOT NULL,
	"concept" text DEFAULT '' NOT NULL,
	"sub_concept" text DEFAULT '' NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"quota_number" numeric DEFAULT '0' NOT NULL,
	"due_date" timestamp DEFAULT '2026-05-21 13:56:53.236' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"completed_at" timestamp,
	"completed_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empleado_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"event_date" timestamp NOT NULL,
	"affects_payroll" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_movement_classification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"representative_id" uuid NOT NULL,
	"client_id" uuid,
	"category" text NOT NULL,
	"is_business_related" boolean DEFAULT true NOT NULL,
	"is_tax_relevant" boolean DEFAULT true NOT NULL,
	"is_cashflow_real" boolean DEFAULT true NOT NULL,
	"notes" text,
	"classified_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"emition_date" timestamp NOT NULL,
	"type" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_identity_number" text NOT NULL,
	"recipient_identity_type" text NOT NULL,
	"emitter_name" text NOT NULL,
	"emitter_identity_number" text NOT NULL,
	"emitter_identity_type" text NOT NULL,
	"currency" text NOT NULL,
	"currency_rate" numeric NOT NULL,
	"sale_point" text NOT NULL,
	"representative_id" uuid,
	"receipt_province" text,
	"client_id" uuid,
	"authorization_number" text NOT NULL,
	"id_from" numeric NOT NULL,
	"id_to" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"amount_iva_0" numeric NOT NULL,
	"iva_25" numeric NOT NULL,
	"amount_iva_25" numeric NOT NULL,
	"iva_5" numeric NOT NULL,
	"amount_iva_5" numeric NOT NULL,
	"iva_105" numeric NOT NULL,
	"amount_iva_105" numeric NOT NULL,
	"iva_21" numeric NOT NULL,
	"amount_iva_21" numeric NOT NULL,
	"iva_27" numeric NOT NULL,
	"amount_iva_27" numeric NOT NULL,
	"amount_taxed" numeric NOT NULL,
	"imp_neto_no_gravado" numeric NOT NULL,
	"amount_exempt" numeric NOT NULL,
	"other_taxes" numeric NOT NULL,
	"total_iva" numeric NOT NULL,
	"amount" numeric NOT NULL,
	CONSTRAINT "invoice_representative_auth_type_unique" UNIQUE("representative_id","authorization_number","type")
);
--> statement-breakpoint
CREATE TABLE "invoice_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"document_id" uuid,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iva_scrape" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"periodo_fiscal" text NOT NULL,
	"fecha_presentacion" text,
	"ok" boolean NOT NULL,
	"debito_fiscal" numeric(18, 2),
	"credito_fiscal" numeric(18, 2),
	"saldo_mes_pasado" numeric(18, 2),
	"saldo_arca_mes" numeric(18, 2),
	"saldo_tecnico_favor_contribuyente" numeric(18, 2),
	"saldo_tecnico_favor_contribuyente_posicion_mensual" numeric(18, 2),
	"saldo_libre_disponibilidad_periodo_anterior_neto" numeric(18, 2),
	"total_retenciones_percepciones_periodo" numeric(18, 2),
	"saldo_libre_disponibilidad_favor_contribuyente_periodo" numeric(18, 2),
	"source_confidence" text DEFAULT 'unknown' NOT NULL,
	"imported_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "iva_scrape_client_periodo_unique" UNIQUE("client_id","periodo_fiscal")
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"type" "job_type" NOT NULL,
	"representative_id" uuid NOT NULL,
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
CREATE TABLE "job_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"client_id" uuid,
	"entry_date" timestamp NOT NULL,
	"description" text,
	"source_type" text,
	"source_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "liquidacion_import_concepto_valor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recibo_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"cantidad" numeric(10, 2),
	"porcentaje" numeric(8, 4),
	"importe_concepto_numero" numeric(14, 2),
	"importe" numeric(14, 2),
	"importe_minimo" numeric(14, 2),
	"importe_maximo" numeric(14, 2),
	"concepto_id" uuid,
	"tipo_liquidacion" text,
	"importe_override" numeric(14, 2),
	"activo_en_recibo" boolean DEFAULT true,
	"memo" text,
	"pct_usado" numeric(8, 4),
	"base_usada" numeric(14, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "liquidacion_import_concepto_valor_recibo_id_codigo_unique" UNIQUE("recibo_id","codigo")
);
--> statement-breakpoint
CREATE TABLE "liquidacion_import_empleado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"cuil" text NOT NULL,
	"legajo" text NOT NULL,
	"nombre" text NOT NULL,
	"fecha_alta" timestamp,
	"fecha_antiguedad_reconocida" timestamp,
	"fecha_baja" timestamp,
	"modo_contrato" text,
	"categoria" text,
	"origen" text DEFAULT 'import' NOT NULL,
	"convenio_id" uuid,
	"categoria_id" uuid,
	"tipo_jornada" "payroll_tipo_jornada" DEFAULT 'full_time',
	"tipo_empleador" "payroll_tipo_empleador",
	"tarea" text,
	"horas_mensuales_normales" integer,
	"dias_mensuales_normales" integer DEFAULT 30,
	"valor_hora" numeric(12, 2),
	"valor_sueldo" numeric(12, 2),
	"porcentaje_aporte_adicional_ss" numeric(5, 4),
	"lugar_pago" text,
	"forma_pago" text,
	"cbu" text,
	"banco" text,
	"activo" boolean DEFAULT true NOT NULL,
	"nacionalidad_id" uuid,
	"fecha_nacimiento" timestamp,
	"conyuge" integer,
	"hijos" integer,
	"adherentes" integer,
	"sexo" text,
	"domicilio" text,
	"localidad" text,
	"codigo_postal" text,
	"provincia_id" uuid,
	"modalidad_contratacion_id" uuid,
	"codigo_modalidad_contratacion" text,
	"situacion_id" uuid,
	"codigo_situacion" text,
	"zona_id" uuid,
	"codigo_zona" text,
	"condicion_id" uuid,
	"codigo_condicion" text,
	"actividad_id" uuid,
	"codigo_actividad" text,
	"siniestrado_id" uuid,
	"codigo_siniestrado" text,
	"observaciones" text,
	"obra_social_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "liquidacion_import_empleado_client_id_cuil_unique" UNIQUE("client_id","cuil")
);
--> statement-breakpoint
CREATE TABLE "liquidacion_import_recibo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empleado_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"tipo" text NOT NULL,
	"fecha" timestamp,
	"basico" numeric(12, 2),
	"haberes" numeric(14, 2) NOT NULL,
	"no_remunerativo" numeric(14, 2) NOT NULL,
	"descuentos" numeric(14, 2) NOT NULL,
	"retenciones" numeric(14, 2) NOT NULL,
	"neto" numeric(14, 2) NOT NULL,
	"quincena" text,
	"obra_social_id" uuid,
	"fecha_pago" timestamp,
	"lugar_pago" text,
	"forma_pago" text,
	"cbu" text,
	"banco" text,
	"periodo_cargas" text,
	"fecha_deposito_cargas" timestamp,
	"situacion_revista" "payroll_situacion_revista",
	"observacion_interna" text,
	"observacion_recibo" text,
	"rem4y8_override" numeric(14, 2),
	"rem9_override" numeric(14, 2),
	"contribucion_tarea_diferencial" numeric(5, 4),
	"importe_a_detraer_ley27430" numeric(12, 2),
	"contribucion_adicional_os" numeric(12, 2),
	"recibo_confirmado" boolean DEFAULT false,
	"calculado_at" timestamp,
	"origen" text DEFAULT 'import' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "liquidacion_import_recibo_empleado_periodo_tipo_origen_unique" UNIQUE("empleado_id","periodo","tipo","origen")
);
--> statement-breakpoint
CREATE TABLE "lsd_concepto_afip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo_afip" text NOT NULL,
	"descripcion" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lsd_concepto_afip_codigo_afip_unique" UNIQUE("codigo_afip")
);
--> statement-breakpoint
CREATE TABLE "lsd_perfil_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"concepto_afip_id" uuid NOT NULL,
	"codigo_contribuyente" text NOT NULL,
	"descripcion_contribuyente" text NOT NULL,
	"marca_repetible" boolean DEFAULT false NOT NULL,
	"aportes_sipa" boolean DEFAULT false NOT NULL,
	"contribuciones_sipa" boolean DEFAULT false NOT NULL,
	"aportes_inssjyp" boolean DEFAULT false NOT NULL,
	"contribuciones_inssjyp" boolean DEFAULT false NOT NULL,
	"aportes_obra_social" boolean DEFAULT false NOT NULL,
	"contribuciones_obra_social" boolean DEFAULT false NOT NULL,
	"aportes_fsr" boolean DEFAULT false NOT NULL,
	"contribuciones_fsr" boolean DEFAULT false NOT NULL,
	"aportes_renatea" boolean DEFAULT false NOT NULL,
	"contribuciones_renatea" boolean DEFAULT false NOT NULL,
	"contribuciones_aaff" boolean DEFAULT false NOT NULL,
	"contribuciones_fne" boolean DEFAULT false NOT NULL,
	"contribuciones_lrt" boolean DEFAULT false NOT NULL,
	"aportes_diferenciales" boolean DEFAULT false NOT NULL,
	"aportes_especiales" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lsd_perfil_concepto_client_id_codigo_contribuyente_unique" UNIQUE("client_id","codigo_contribuyente")
);
--> statement-breakpoint
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
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"representative_id" uuid,
	"client_id" uuid,
	"message" text NOT NULL,
	"expiration_date" timestamp NOT NULL,
	"publication_date" timestamp NOT NULL,
	"opened" boolean DEFAULT false NOT NULL,
	"severity" text DEFAULT 'unclassified' NOT NULL,
	"category" text,
	"ai_summary" text,
	"ai_classified_at" timestamp,
	"assigned_to_user_id" text,
	"resolved_at" timestamp,
	"resolved_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_social" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "obra_social_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"module" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_module_org_id_module_unique" UNIQUE("organization_id","module")
);
--> statement-breakpoint
CREATE TABLE "payroll_actividad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_actividad_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
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
	"numero_sos" integer,
	"codigo_arca" text,
	"base_columna" "payroll_base_columna",
	"div_cantidad" numeric(8, 4) DEFAULT '1',
	"div_hs_norm" boolean DEFAULT false NOT NULL,
	"imp_min" numeric(12, 2),
	"imp_max" numeric(12, 2),
	"ref_concepto_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_condicion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_condicion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_convenio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"cct_codigo" text,
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
CREATE TABLE "payroll_convenio_fuente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"convenio_id" uuid NOT NULL,
	"fuente" text NOT NULL,
	"detalle" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_convenio_fuente_convenio_id_fuente_unique" UNIQUE("convenio_id","fuente")
);
--> statement-breakpoint
CREATE TABLE "payroll_escala" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"vigencia_desde" timestamp NOT NULL,
	"vigencia_hasta" timestamp,
	"monto_basico" numeric(12, 2) NOT NULL,
	"monto_no_remunerativo" numeric(12, 2) DEFAULT '0' NOT NULL,
	"periodo_label" text,
	"fuente" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_modalidad_contratacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_modalidad_contratacion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_nacionalidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_nacionalidad_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_period_novelty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empleado_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(10, 2),
	"amount" numeric(14, 2),
	"description" text,
	"applied_to_recibo_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_provincia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_provincia_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_receipt_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"receipt_type" text DEFAULT 'sueldo' NOT NULL,
	"concept_ids" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_siniestrado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_siniestrado_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_situacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_situacion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "payroll_zona" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_zona_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "representative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"cuit" text DEFAULT '' NOT NULL,
	"afip_password" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"image" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"convenio_multilateral" boolean DEFAULT false NOT NULL,
	"regimen_local" boolean DEFAULT false NOT NULL,
	"fiscal_condition" text,
	"liquida_sueldos" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "representative_balance_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"fiscal_year_end_month" integer NOT NULL,
	"fiscal_year_end_day" integer NOT NULL,
	"presentation_due_days" integer,
	"alert_days_before" jsonb DEFAULT '[60,30,15,7]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "representative_balance_config_representative_id_unique" UNIQUE("representative_id")
);
--> statement-breakpoint
CREATE TABLE "representative_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"representative_id" uuid NOT NULL,
	"client_id" uuid,
	"requested_by_user_id" text,
	"title" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "representative_user_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representative_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'client_viewer' NOT NULL,
	"can_upload_documents" boolean DEFAULT true NOT NULL,
	"can_view_debts" boolean DEFAULT true NOT NULL,
	"can_view_iva" boolean DEFAULT true NOT NULL,
	"can_view_payroll" boolean DEFAULT false NOT NULL,
	"can_chat_ai" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "representative_user_access_representative_id_user_id_unique" UNIQUE("representative_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tax_projection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"period" text NOT NULL,
	"tax" text NOT NULL,
	"projected_amount" numeric(14, 2) NOT NULL,
	"confidence" text,
	"factors" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tax_projection_client_id_period_tax_unique" UNIQUE("client_id","period","tax")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_anonymous" boolean,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"changed_password" boolean,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_account" ADD CONSTRAINT "accounting_account_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_account" ADD CONSTRAINT "accounting_account_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."accounting_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afip_empleadores_convenio" ADD CONSTRAINT "afip_empleadores_convenio_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "afip_empleadores_convenio" ADD CONSTRAINT "afip_empleadores_convenio_convenio_id_convenios_de_trabajo_id_fk" FOREIGN KEY ("convenio_id") REFERENCES "public"."convenios_de_trabajo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_conversation_id_agent_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_conversation_id_agent_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_invoice_match" ADD CONSTRAINT "bank_invoice_match_bank_transaction_id_bank_transaction_id_fk" FOREIGN KEY ("bank_transaction_id") REFERENCES "public"."bank_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_invoice_match" ADD CONSTRAINT "bank_invoice_match_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_invoice_match" ADD CONSTRAINT "bank_invoice_match_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_risk_snapshot" ADD CONSTRAINT "client_risk_snapshot_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepto_sos" ADD CONSTRAINT "concepto_sos_concepto_afip_id_lsd_concepto_afip_id_fk" FOREIGN KEY ("concepto_afip_id") REFERENCES "public"."lsd_concepto_afip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepto_sos_client" ADD CONSTRAINT "concepto_sos_client_concepto_id_concepto_sos_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."concepto_sos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepto_sos_client" ADD CONSTRAINT "concepto_sos_client_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_event" ADD CONSTRAINT "data_source_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_event" ADD CONSTRAINT "data_source_event_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_event" ADD CONSTRAINT "data_source_event_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_event" ADD CONSTRAINT "data_source_event_source_job_id_job_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt" ADD CONSTRAINT "debt_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt" ADD CONSTRAINT "debt_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_date" ADD CONSTRAINT "due_date_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_date" ADD CONSTRAINT "due_date_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_date" ADD CONSTRAINT "due_date_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_event" ADD CONSTRAINT "employee_event_empleado_id_liquidacion_import_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."liquidacion_import_empleado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_event" ADD CONSTRAINT "employee_event_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movement_classification" ADD CONSTRAINT "financial_movement_classification_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_movement_classification" ADD CONSTRAINT "financial_movement_classification_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_attachment" ADD CONSTRAINT "invoice_attachment_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_attachment" ADD CONSTRAINT "invoice_attachment_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iva_scrape" ADD CONSTRAINT "iva_scrape_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_log" ADD CONSTRAINT "job_log_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_journal_entry_id_journal_entry_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_line" ADD CONSTRAINT "journal_entry_line_account_id_accounting_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_concepto_valor" ADD CONSTRAINT "liquidacion_import_concepto_valor_recibo_id_liquidacion_import_recibo_id_fk" FOREIGN KEY ("recibo_id") REFERENCES "public"."liquidacion_import_recibo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_concepto_valor" ADD CONSTRAINT "liquidacion_import_concepto_valor_concepto_id_payroll_concepto_id_fk" FOREIGN KEY ("concepto_id") REFERENCES "public"."payroll_concepto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_convenio_id_payroll_convenio_id_fk" FOREIGN KEY ("convenio_id") REFERENCES "public"."payroll_convenio"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_categoria_id_payroll_convenio_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."payroll_convenio_categoria"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_nacionalidad_id_payroll_nacionalidad_id_fk" FOREIGN KEY ("nacionalidad_id") REFERENCES "public"."payroll_nacionalidad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_provincia_id_payroll_provincia_id_fk" FOREIGN KEY ("provincia_id") REFERENCES "public"."payroll_provincia"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_modalidad_contratacion_id_payroll_modalidad_contratacion_id_fk" FOREIGN KEY ("modalidad_contratacion_id") REFERENCES "public"."payroll_modalidad_contratacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_situacion_id_payroll_situacion_id_fk" FOREIGN KEY ("situacion_id") REFERENCES "public"."payroll_situacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_zona_id_payroll_zona_id_fk" FOREIGN KEY ("zona_id") REFERENCES "public"."payroll_zona"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_condicion_id_payroll_condicion_id_fk" FOREIGN KEY ("condicion_id") REFERENCES "public"."payroll_condicion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_actividad_id_payroll_actividad_id_fk" FOREIGN KEY ("actividad_id") REFERENCES "public"."payroll_actividad"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_siniestrado_id_payroll_siniestrado_id_fk" FOREIGN KEY ("siniestrado_id") REFERENCES "public"."payroll_siniestrado"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_obra_social_id_obra_social_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obra_social"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD CONSTRAINT "liquidacion_import_recibo_empleado_id_liquidacion_import_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."liquidacion_import_empleado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_import_recibo" ADD CONSTRAINT "liquidacion_import_recibo_obra_social_id_obra_social_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obra_social"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lsd_perfil_concepto" ADD CONSTRAINT "lsd_perfil_concepto_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lsd_perfil_concepto" ADD CONSTRAINT "lsd_perfil_concepto_concepto_afip_id_lsd_concepto_afip_id_fk" FOREIGN KEY ("concepto_afip_id") REFERENCES "public"."lsd_concepto_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_module" ADD CONSTRAINT "organization_module_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_concepto" ADD CONSTRAINT "payroll_concepto_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_convenio" ADD CONSTRAINT "payroll_convenio_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_convenio_categoria" ADD CONSTRAINT "payroll_convenio_categoria_convenio_id_payroll_convenio_id_fk" FOREIGN KEY ("convenio_id") REFERENCES "public"."payroll_convenio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_convenio_fuente" ADD CONSTRAINT "payroll_convenio_fuente_convenio_id_payroll_convenio_id_fk" FOREIGN KEY ("convenio_id") REFERENCES "public"."payroll_convenio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_escala" ADD CONSTRAINT "payroll_escala_categoria_id_payroll_convenio_categoria_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."payroll_convenio_categoria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_period_novelty" ADD CONSTRAINT "payroll_period_novelty_empleado_id_liquidacion_import_empleado_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."liquidacion_import_empleado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_period_novelty" ADD CONSTRAINT "payroll_period_novelty_applied_to_recibo_id_liquidacion_import_recibo_id_fk" FOREIGN KEY ("applied_to_recibo_id") REFERENCES "public"."liquidacion_import_recibo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_receipt_template" ADD CONSTRAINT "payroll_receipt_template_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative" ADD CONSTRAINT "representative_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative" ADD CONSTRAINT "representative_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_balance_config" ADD CONSTRAINT "representative_balance_config_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_request" ADD CONSTRAINT "representative_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_request" ADD CONSTRAINT "representative_request_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_request" ADD CONSTRAINT "representative_request_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_request" ADD CONSTRAINT "representative_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_user_access" ADD CONSTRAINT "representative_user_access_representative_id_representative_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representative"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_user_access" ADD CONSTRAINT "representative_user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_projection" ADD CONSTRAINT "tax_projection_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_org_status" ON "alert" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_debt_representative_date" ON "debt" USING btree ("representative_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_duedate_representative_date" ON "due_date" USING btree ("representative_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_invoice_representative" ON "invoice" USING btree ("representative_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_representative_date" ON "invoice" USING btree ("representative_id","emition_date");--> statement-breakpoint
CREATE INDEX "idx_notification_representative_opened" ON "notification" USING btree ("representative_id","opened");--> statement-breakpoint
CREATE INDEX "idx_notification_severity" ON "notification" USING btree ("representative_id","severity");--> statement-breakpoint
CREATE INDEX "idx_representative_org" ON "representative" USING btree ("organization_id");