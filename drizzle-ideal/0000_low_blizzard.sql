-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."acceso_rol" AS ENUM('cliente_lector');--> statement-breakpoint
CREATE TYPE "public"."actor_tipo" AS ENUM('user', 'job', 'agent');--> statement-breakpoint
CREATE TYPE "public"."agent_action_estado" AS ENUM('propuesta', 'aprobada', 'rechazada', 'ejecutada');--> statement-breakpoint
CREATE TYPE "public"."agent_message_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."agent_run_resultado" AS ENUM('ok', 'error', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."agent_run_tipo" AS ENUM('chat', 'alerta', 'clasificacion', 'proyeccion', 'revision');--> statement-breakpoint
CREATE TYPE "public"."alerta_estado" AS ENUM('abierta', 'resuelta');--> statement-breakpoint
CREATE TYPE "public"."alerta_origen" AS ENUM('job');--> statement-breakpoint
CREATE TYPE "public"."alerta_severidad" AS ENUM('baja', 'media', 'alta', 'critica');--> statement-breakpoint
CREATE TYPE "public"."alerta_tipo" AS ENUM('error_scraping');--> statement-breakpoint
CREATE TYPE "public"."asiento_linea_lado" AS ENUM('debe', 'haber');--> statement-breakpoint
CREATE TYPE "public"."asiento_origen_tipo" AS ENUM('manual', 'comprobante', 'recibo', 'movimiento_bancario', 'cierre', 'apertura', 'import');--> statement-breakpoint
CREATE TYPE "public"."bien_uso_categoria" AS ENUM('rodados', 'muebles_utiles', 'equipos_computacion', 'instalaciones', 'inmuebles', 'maquinarias', 'otros');--> statement-breakpoint
CREATE TYPE "public"."bien_uso_estado" AS ENUM('activo', 'vendido', 'baja');--> statement-breakpoint
CREATE TYPE "public"."bien_uso_metodo" AS ENUM('lineal');--> statement-breakpoint
CREATE TYPE "public"."bien_uso_motivo_baja" AS ENUM('venta', 'desuso', 'destruccion');--> statement-breakpoint
CREATE TYPE "public"."cliente_estado" AS ENUM('activo', 'pausado', 'baja');--> statement-breakpoint
CREATE TYPE "public"."comprobante_clase" AS ENUM('factura', 'nota_credito', 'nota_debito', 'recibo', 'tique');--> statement-breakpoint
CREATE TYPE "public"."comprobante_direccion" AS ENUM('emitido', 'recibido');--> statement-breakpoint
CREATE TYPE "public"."concepto_base" AS ENUM('basico', 'bruto', 'total_remunerativo', 'total_no_remunerativo', 'total_descuentos', 'neto', 'fijo', 'custom');--> statement-breakpoint
CREATE TYPE "public"."concepto_base_columna" AS ENUM('valHora', 'sueldoLegajo', 'sueldo', 'importe_fijo', 'ref_concepto', 'sub1_9', 'sub1_19', 'sub1_26', 'sub1_39', 'sub1_199', 'sub411_469', 'sub1_199_plus_411_469', 'sub411_414_qty', 'os_base', 'os_norem_base', 'sac_normal', 'sac_proporcional', 'bruto_anterior_div25', 'concepto_401_div12');--> statement-breakpoint
CREATE TYPE "public"."concepto_tipo" AS ENUM('remunerativo', 'no_remunerativo', 'descuento', 'retencion');--> statement-breakpoint
CREATE TYPE "public"."conciliacion_estado" AS ENUM('sugerida', 'confirmada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."condicion_iva" AS ENUM('responsable_inscripto', 'monotributista', 'exento', 'no_alcanzado');--> statement-breakpoint
CREATE TYPE "public"."confianza" AS ENUM('baja', 'media', 'alta');--> statement-breakpoint
CREATE TYPE "public"."credencial_estado" AS ENUM('activa', 'clave_invalida', 'bloqueada');--> statement-breakpoint
CREATE TYPE "public"."cuenta_alcance" AS ENUM('base', 'propia');--> statement-breakpoint
CREATE TYPE "public"."cuenta_bancaria_tipo" AS ENUM('caja_ahorro', 'cuenta_corriente', 'otra');--> statement-breakpoint
CREATE TYPE "public"."cuenta_flujo_efectivo" AS ENUM('operativa', 'inversion', 'financiacion');--> statement-breakpoint
CREATE TYPE "public"."cuenta_funcion_gasto" AS ENUM('administracion', 'comercializacion', 'financiero', 'otro');--> statement-breakpoint
CREATE TYPE "public"."cuenta_naturaleza_inflacion" AS ENUM('monetaria', 'no_monetaria');--> statement-breakpoint
CREATE TYPE "public"."cuenta_rubro" AS ENUM('caja_bancos', 'inversiones_temporarias', 'creditos_ventas', 'otros_creditos_cte', 'bienes_cambio', 'otros_activos_cte', 'creditos_largo_plazo', 'bienes_uso', 'intangibles', 'inversiones_permanentes', 'otros_activos_no_cte', 'deudas_comerciales', 'deudas_financieras', 'deudas_sociales', 'deudas_fiscales', 'otras_deudas_cte', 'deudas_largo_plazo', 'previsiones', 'capital', 'aportes_irrevocables', 'primas_emision', 'reservas', 'resultados_no_asignados', 'resultado_ejercicio', 'ventas', 'costo_ventas', 'gastos_administracion', 'gastos_comercializacion', 'gastos_financieros', 'otros_resultados_pos', 'otros_resultados_neg', 'impuesto_ganancias');--> statement-breakpoint
CREATE TYPE "public"."cuenta_saldo" AS ENUM('deudor', 'acreedor', 'ambos');--> statement-breakpoint
CREATE TYPE "public"."cuenta_tipo" AS ENUM('imputable', 'grupo');--> statement-breakpoint
CREATE TYPE "public"."dato_fuente" AS ENUM('scraper', 'manual', 'import', 'ai', 'calculo');--> statement-breakpoint
CREATE TYPE "public"."deuda_estado" AS ENUM('abierta', 'pagada', 'plan_pago', 'prescripta');--> statement-breakpoint
CREATE TYPE "public"."documento_tipo" AS ENUM('cuit', 'dni', 'otro');--> statement-breakpoint
CREATE TYPE "public"."eecc_estado" AS ENUM('borrador', 'aprobado');--> statement-breakpoint
CREATE TYPE "public"."ejercicio_estado" AS ENUM('abierto', 'en_cierre', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."evento_tipo" AS ENUM('alta', 'cambio', 'baja', 'deteccion');--> statement-breakpoint
CREATE TYPE "public"."forma_pago" AS ENUM('efectivo', 'deposito', 'transferencia', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."impuesto" AS ENUM('iva', 'ganancias', 'ingresos_brutos', 'cargas_sociales');--> statement-breakpoint
CREATE TYPE "public"."job_log_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'failed', 'finished');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('iva', 'comprobantes', 'comprobantes_full', 'notificaciones', 'deuda', 'vencimientos', 'batch');--> statement-breakpoint
CREATE TYPE "public"."movimiento_direccion" AS ENUM('ingreso', 'egreso');--> statement-breakpoint
CREATE TYPE "public"."notificacion_severidad" AS ENUM('sin_clasificar', 'informativa', 'accion_requerida', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."org_module" AS ENUM('sueldos', 'banco', 'contabilidad', 'analytics', 'portal_cliente', 'ai_agent');--> statement-breakpoint
CREATE TYPE "public"."periodo_estado" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."provincia_fuente" AS ENUM('padron', 'nosis', 'manual');--> statement-breakpoint
CREATE TYPE "public"."recibo_tipo" AS ENUM('mensual', 'quincenal', 'sac', 'liquidacion_final', 'vacaciones');--> statement-breakpoint
CREATE TYPE "public"."regla_mapeo_base" AS ENUM('total', 'neto', 'iva', 'otros_tributos', 'valor_concepto', 'fijo');--> statement-breakpoint
CREATE TYPE "public"."regla_mapeo_modulo" AS ENUM('comprobante', 'recibo', 'movimiento_bancario');--> statement-breakpoint
CREATE TYPE "public"."regla_mapeo_tipo" AS ENUM('default', 'condicional');--> statement-breakpoint
CREATE TYPE "public"."relacion_fuente" AS ENUM('discovery', 'manual');--> statement-breakpoint
CREATE TYPE "public"."riesgo_nivel" AS ENUM('bajo', 'medio', 'alto', 'critico');--> statement-breakpoint
CREATE TYPE "public"."sexo" AS ENUM('masculino', 'femenino');--> statement-breakpoint
CREATE TYPE "public"."solicitud_estado" AS ENUM('abierta', 'completada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."solicitud_tipo" AS ENUM('documentacion', 'informacion', 'pago', 'otra');--> statement-breakpoint
CREATE TYPE "public"."tipo_jornada" AS ENUM('full_time', 'part_time', 'reducida');--> statement-breakpoint
CREATE TYPE "public"."tipo_persona" AS ENUM('fisica', 'juridica');--> statement-breakpoint
CREATE TABLE "anexo_cmv" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"ejercicio_id" uuid NOT NULL,
	"existencia_inicial" numeric(15, 2) DEFAULT '0' NOT NULL,
	"compras_gastos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"existencia_final" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anexo_cmv_cliente_id_ejercicio_id_key" UNIQUE("cliente_id","ejercicio_id")
);
--> statement-breakpoint
CREATE TABLE "agent_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cliente_id" uuid,
	"titulo" text DEFAULT 'Nueva conversación' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"conversation_id" uuid,
	"cliente_id" uuid,
	"user_id" text,
	"tipo" "agent_run_tipo" NOT NULL,
	"modelo" text,
	"costo" numeric(12, 6),
	"resultado" "agent_run_resultado",
	"input" jsonb,
	"output" jsonb,
	"tool_trace" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"cliente_id" uuid,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"estado" "agent_action_estado" DEFAULT 'propuesta' NOT NULL,
	"decidido_por" text,
	"decidido_at" timestamp with time zone,
	"ejecutado_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_action_decision_coherente" CHECK (((estado = 'propuesta'::agent_action_estado) AND (decidido_at IS NULL)) OR ((estado <> 'propuesta'::agent_action_estado) AND (decidido_at IS NOT NULL))),
	CONSTRAINT "agent_action_ejecucion_coherente" CHECK ((estado = 'ejecutada'::agent_action_estado) = (ejecutado_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recibo_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recibo_id" uuid NOT NULL,
	"concepto_id" uuid NOT NULL,
	"tipo" "concepto_tipo",
	"monto" numeric(15, 2) NOT NULL,
	"cantidad" numeric(12, 4),
	"porcentaje" numeric(9, 4),
	"importe" numeric(15, 2),
	"importe_min" numeric(15, 2),
	"importe_max" numeric(15, 2),
	"concepto_ref" smallint,
	"memo" text,
	"pct_usado" numeric(9, 4),
	"base_usada" numeric(15, 2),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recibo_concepto_recibo_id_concepto_id_memo_key" UNIQUE("recibo_id","concepto_id","memo")
);
--> statement-breakpoint
CREATE TABLE "convenio_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"convenio_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer,
	"es_valor_hora" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convenio_categoria_convenio_id_codigo_key" UNIQUE("convenio_id","codigo")
);
--> statement-breakpoint
CREATE TABLE "bien_de_uso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"categoria" "bien_uso_categoria" NOT NULL,
	"cuenta_bien_id" uuid NOT NULL,
	"cuenta_amortizacion_acumulada_id" uuid NOT NULL,
	"cuenta_amortizacion_gasto_id" uuid NOT NULL,
	"fecha_alta" date NOT NULL,
	"valor_origen" numeric(15, 2) NOT NULL,
	"vida_util_anios" integer NOT NULL,
	"valor_residual" numeric(15, 2) DEFAULT '0' NOT NULL,
	"metodo" "bien_uso_metodo" DEFAULT 'lineal' NOT NULL,
	"estado" "bien_uso_estado" DEFAULT 'activo' NOT NULL,
	"fecha_baja" date,
	"motivo_baja" "bien_uso_motivo_baja",
	"creado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ejercicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha_desde" date NOT NULL,
	"fecha_hasta" date NOT NULL,
	"estado" "ejercicio_estado" DEFAULT 'abierto' NOT NULL,
	"cerrado_at" timestamp with time zone,
	"cerrado_por" text,
	"reabierto_at" timestamp with time zone,
	"reabierto_por" text,
	"motivo_reapertura" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ejercicio_cliente_id_numero_key" UNIQUE("cliente_id","numero")
);
--> statement-breakpoint
CREATE TABLE "movimiento_bancario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_bancaria_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"periodo" date GENERATED ALWAYS AS ((date_trunc('month'::text, (fecha)::timestamp without time zone))::date) STORED,
	"direccion" "movimiento_direccion" NOT NULL,
	"importe" numeric(15, 2) NOT NULL,
	"descripcion" text,
	"saldo_posterior" numeric(15, 2),
	"contraparte_id" uuid,
	"contraparte_texto" text,
	"id_externo" text,
	"datos_crudos" jsonb,
	"fuente" "dato_fuente" DEFAULT 'import' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "movimiento_bancario_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)),
	CONSTRAINT "movimiento_bancario_importe_positivo" CHECK (importe > (0)::numeric)
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuenta_bancaria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"banco" text NOT NULL,
	"tipo" "cuenta_bancaria_tipo",
	"numero" text,
	"cbu" text,
	"alias" text,
	"moneda" char(3) DEFAULT 'ARS' NOT NULL,
	"cuenta_contable_id" uuid,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuenta_bancaria_cliente_id_banco_numero_key" UNIQUE("cliente_id","banco","numero")
);
--> statement-breakpoint
CREATE TABLE "cliente_credencial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"credencial_id" uuid NOT NULL,
	"fuente" "relacion_fuente" DEFAULT 'manual' NOT NULL,
	"afip_contribuyente_id" integer,
	"preferida" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_credencial_cliente_id_credencial_id_key" UNIQUE("cliente_id","credencial_id")
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cuit" text NOT NULL,
	"razon_social" text NOT NULL,
	"tipo_persona" "tipo_persona" NOT NULL,
	"condicion_iva" "condicion_iva",
	"estado" "cliente_estado" DEFAULT 'activo' NOT NULL,
	"baja_motivo" text,
	"baja_at" timestamp with time zone,
	"email" text,
	"telefono" text,
	"domicilio" text,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_org_id_cuit_key" UNIQUE("org_id","cuit")
);
--> statement-breakpoint
CREATE TABLE "evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"tipo" "evento_tipo" NOT NULL,
	"actor_tipo" "actor_tipo" NOT NULL,
	"actor_id" text,
	"detalle" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"direccion" "comprobante_direccion" NOT NULL,
	"tipo" smallint NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" bigint NOT NULL,
	"fecha_emision" date NOT NULL,
	"periodo" date GENERATED ALWAYS AS ((date_trunc('month'::text, (fecha_emision)::timestamp without time zone))::date) STORED,
	"contraparte_id" uuid NOT NULL,
	"moneda" char(3) DEFAULT 'ARS' NOT NULL,
	"cotizacion" numeric(15, 4) DEFAULT '1' NOT NULL,
	"neto_gravado" numeric(15, 2) DEFAULT '0' NOT NULL,
	"neto_no_gravado" numeric(15, 2) DEFAULT '0' NOT NULL,
	"exento" numeric(15, 2) DEFAULT '0' NOT NULL,
	"otros_tributos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"iva_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total" numeric(15, 2) NOT NULL,
	"cae" text,
	"fuente" "dato_fuente" DEFAULT 'scraper' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "comprobante_cliente_id_direccion_contraparte_id_tipo_punto__key" UNIQUE("cliente_id","direccion","tipo","punto_venta","numero","contraparte_id"),
	CONSTRAINT "comprobante_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "comprobante_tipo" (
	"codigo" smallint PRIMARY KEY NOT NULL,
	"descripcion" text NOT NULL,
	"letra" char(1),
	"clase" "comprobante_clase" NOT NULL,
	"es_nc" boolean NOT NULL,
	"discrimina_iva" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"credencial_id" uuid,
	"cliente_id" uuid,
	"tipo" "alerta_tipo" NOT NULL,
	"severidad" "alerta_severidad" NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"origen_tipo" "alerta_origen",
	"origen_id" uuid,
	"estado" "alerta_estado" DEFAULT 'abierta' NOT NULL,
	"asignada_a" text,
	"resuelta_at" timestamp with time zone,
	"resuelta_por" text,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerta_resuelta_coherente" CHECK ((estado = 'resuelta'::alerta_estado) OR ((estado <> 'resuelta'::alerta_estado) AND (resuelta_at IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "solicitud" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" "solicitud_tipo" NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"estado" "solicitud_estado" DEFAULT 'abierta' NOT NULL,
	"pedida_por" text,
	"vence_at" timestamp with time zone,
	"completada_at" timestamp with time zone,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitud_completada_coherente" CHECK ((estado = 'completada'::solicitud_estado) = (completada_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "riesgo_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"nivel" "riesgo_nivel" NOT NULL,
	"factores" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riesgo_snapshot_cliente_id_periodo_key" UNIQUE("cliente_id","periodo")
);
--> statement-breakpoint
CREATE TABLE "proyeccion_impuesto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"impuesto" "impuesto" NOT NULL,
	"monto_proyectado" numeric(15, 2) NOT NULL,
	"confianza" "confianza",
	"factores" jsonb,
	"generada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proyeccion_impuesto_cliente_id_periodo_impuesto_key" UNIQUE("cliente_id","periodo","impuesto")
);
--> statement-breakpoint
CREATE TABLE "notificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"credencial_id" uuid NOT NULL,
	"cliente_id" uuid,
	"external_id" text,
	"mensaje" text NOT NULL,
	"publicada_at" timestamp with time zone,
	"vence_at" timestamp with time zone,
	"leida" boolean DEFAULT false NOT NULL,
	"severidad" "notificacion_severidad" DEFAULT 'sin_clasificar' NOT NULL,
	"categoria" text,
	"ai_resumen" text,
	"ai_clasificada_at" timestamp with time zone,
	"asignada_a" text,
	"resuelta_at" timestamp with time zone,
	"resuelta_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"concepto_id" uuid NOT NULL,
	"habilitado" boolean DEFAULT true NOT NULL,
	"codigo_propio" text,
	"nombre_propio" text,
	"concepto_afip_id" uuid,
	"tipo" "concepto_tipo",
	"base_calculo" "concepto_base",
	"base_columna" "concepto_base_columna",
	"formula" text,
	"orden" integer,
	"importe_min" numeric(15, 2),
	"importe_max" numeric(15, 2),
	"div_cantidad" numeric(10, 4),
	"div_hs_norm" boolean DEFAULT false NOT NULL,
	"vigencia_desde" date,
	"vigencia_hasta" date,
	"repetible" boolean DEFAULT false NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_concepto_cliente_id_concepto_id_key" UNIQUE("cliente_id","concepto_id")
);
--> statement-breakpoint
CREATE TABLE "concepto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" smallint NOT NULL,
	"nombre" text NOT NULL,
	"codigo_afip" text NOT NULL,
	"tipo" "concepto_tipo",
	"base_columna" "concepto_base_columna" NOT NULL,
	"pct_fijo" numeric(7, 4),
	"div_hs_norm" integer DEFAULT 1 NOT NULL,
	"div_cantidad" integer DEFAULT 1 NOT NULL,
	"usa_memo" boolean DEFAULT false NOT NULL,
	"usa_cantidad" boolean DEFAULT false NOT NULL,
	"usa_pct" boolean DEFAULT false NOT NULL,
	"usa_concepto_ref" boolean DEFAULT false NOT NULL,
	"usa_importe" boolean DEFAULT false NOT NULL,
	"usa_importe_min" boolean DEFAULT false NOT NULL,
	"usa_importe_max" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepto_numero_key" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "concepto_afip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepto_afip_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "convenio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cct_codigo" text,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convenio_cliente_id_nombre_key" UNIQUE("cliente_id","nombre")
);
--> statement-breakpoint
CREATE TABLE "cct" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"signatarios" text,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cct_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "empleado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cuil" text NOT NULL,
	"legajo" text NOT NULL,
	"nombre" text NOT NULL,
	"sexo" "sexo",
	"fecha_nacimiento" date,
	"nacionalidad_id" uuid,
	"domicilio" text,
	"localidad_id" uuid,
	"provincia_id" uuid,
	"codigo_postal" text,
	"fecha_alta" date NOT NULL,
	"fecha_baja" date,
	"activo" boolean DEFAULT true NOT NULL,
	"convenio_id" uuid,
	"categoria_id" uuid,
	"categoria_texto" text,
	"tarea" text,
	"tipo_jornada" "tipo_jornada" DEFAULT 'full_time' NOT NULL,
	"horas_mensuales_normales" integer DEFAULT 0 NOT NULL,
	"dias_mensuales_normales" integer DEFAULT 0 NOT NULL,
	"valor_hora" numeric(15, 2),
	"valor_sueldo" numeric(15, 2),
	"obra_social_id" uuid,
	"conyuge" integer DEFAULT 0 NOT NULL,
	"hijos" integer DEFAULT 0 NOT NULL,
	"forma_pago" "forma_pago",
	"banco" text,
	"cbu" text,
	"situacion_id" uuid NOT NULL,
	"condicion_id" uuid NOT NULL,
	"actividad_id" uuid NOT NULL,
	"modalidad_contratacion_id" uuid,
	"siniestrado_id" uuid NOT NULL,
	"zona_id" uuid,
	"observaciones" text,
	"fuente" "dato_fuente" DEFAULT 'import' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "empleado_cliente_id_cuil_key" UNIQUE("cliente_id","cuil"),
	CONSTRAINT "empleado_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cliente_cct" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cct_codigo" text NOT NULL,
	"actividad" text,
	"signatarios" text,
	"fecha_novedad" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_cct_cliente_id_cct_codigo_key" UNIQUE("cliente_id","cct_codigo")
);
--> statement-breakpoint
CREATE TABLE "situacion_revista" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "situacion_revista_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "condicion_trabajador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "condicion_trabajador_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "modalidad_contratacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modalidad_contratacion_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "actividad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actividad_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "zona" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zona_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "provincia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provincia_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "localidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localidad_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "nacionalidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nacionalidad_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "siniestrado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "siniestrado_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "obra_social" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"codigo_sos" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obra_social_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "lsd_presentacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"numero" smallint DEFAULT 1 NOT NULL,
	"filename" text NOT NULL,
	"empleados" integer NOT NULL,
	"conceptos" integer NOT NULL,
	"contenido" text NOT NULL,
	"generado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lsd_presentacion_cliente_id_periodo_numero_key" UNIQUE("cliente_id","periodo","numero")
);
--> statement-breakpoint
CREATE TABLE "parametro_periodo" (
	"periodo" date PRIMARY KEY NOT NULL,
	"tope_maximo_imponible" numeric(15, 2),
	"salario_minimo" numeric(15, 2),
	"fuente" text,
	"actualizado_por_cron" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"ejercicio_id" uuid NOT NULL,
	"periodo_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" text,
	"origen_tipo" "asiento_origen_tipo" DEFAULT 'manual' NOT NULL,
	"origen_id" uuid,
	"regla_id" uuid,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_at" timestamp with time zone,
	"anulado_por" text,
	"motivo_anulacion" text,
	"editado_post_generacion" boolean DEFAULT false NOT NULL,
	"fuente" "dato_fuente" DEFAULT 'manual' NOT NULL,
	"creado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "asiento_cliente_id_ejercicio_id_numero_key" UNIQUE("cliente_id","ejercicio_id","numero"),
	CONSTRAINT "asiento_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)),
	CONSTRAINT "asiento_origen_coherente" CHECK (((origen_tipo = 'manual'::asiento_origen_tipo) AND (origen_id IS NULL)) OR ((origen_tipo <> 'manual'::asiento_origen_tipo) AND (origen_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "regla_mapeo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"modulo" "regla_mapeo_modulo" NOT NULL,
	"tipo" "regla_mapeo_tipo" DEFAULT 'default' NOT NULL,
	"condicion" jsonb,
	"prioridad" integer DEFAULT 100 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periodo_contable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"ejercicio_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"estado" "periodo_estado" DEFAULT 'abierto' NOT NULL,
	"cerrado_at" timestamp with time zone,
	"cerrado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodo_contable_cliente_id_periodo_key" UNIQUE("cliente_id","periodo")
);
--> statement-breakpoint
CREATE TABLE "eecc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"ejercicio_id" uuid NOT NULL,
	"estado" "eecc_estado" DEFAULT 'borrador' NOT NULL,
	"notas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aprobado_at" timestamp with time zone,
	"aprobado_por" text,
	"pdf_key" text,
	"pdf_bytes" integer,
	"pdf_generado_at" timestamp with time zone,
	"pdf_generado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eecc_cliente_id_ejercicio_id_key" UNIQUE("cliente_id","ejercicio_id")
);
--> statement-breakpoint
CREATE TABLE "firmante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"nombre" text NOT NULL,
	"titulo" text DEFAULT 'Contador Público' NOT NULL,
	"universidad" text,
	"consejo" text,
	"tomo" text,
	"folio" text,
	"firma_imagen_key" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conciliacion_comprobante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movimiento_bancario_id" uuid NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"importe_conciliado" numeric(15, 2) NOT NULL,
	"estado" "conciliacion_estado" DEFAULT 'sugerida' NOT NULL,
	"fuente" "dato_fuente" DEFAULT 'manual' NOT NULL,
	"confianza" numeric(5, 4),
	"revisado_por" text,
	"revisado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "conciliacion_comprobante_movimiento_bancario_id_comprobante_key" UNIQUE("movimiento_bancario_id","comprobante_id"),
	CONSTRAINT "conciliacion_comprobante_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)),
	CONSTRAINT "conciliacion_importe_positivo" CHECK (importe_conciliado > (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"credencial_id" uuid NOT NULL,
	"cliente_id" uuid,
	"nombre" text NOT NULL,
	"storage_key" text,
	"mime_type" text NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"checksum" text,
	"fuente" "dato_fuente" DEFAULT 'scraper' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "documento_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "acceso_usuario_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"rol" "acceso_rol" DEFAULT 'cliente_lector' NOT NULL,
	"puede_subir_documentos" boolean DEFAULT true NOT NULL,
	"puede_ver_deudas" boolean DEFAULT true NOT NULL,
	"puede_ver_iva" boolean DEFAULT true NOT NULL,
	"puede_ver_sueldos" boolean DEFAULT false NOT NULL,
	"puede_chatear_ia" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acceso_usuario_cliente_user_id_cliente_id_key" UNIQUE("user_id","cliente_id")
);
--> statement-breakpoint
CREATE TABLE "organization_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"module" "org_module" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_module_org_id_module_key" UNIQUE("org_id","module")
);
--> statement-breakpoint
CREATE TABLE "asiento_linea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asiento_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"debe" numeric(15, 2) DEFAULT '0' NOT NULL,
	"haber" numeric(15, 2) DEFAULT '0' NOT NULL,
	"descripcion" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asiento_linea_un_lado" CHECK (((debe = (0)::numeric) AND (haber > (0)::numeric)) OR ((debe > (0)::numeric) AND (haber = (0)::numeric)))
);
--> statement-breakpoint
CREATE TABLE "regla_mapeo_linea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regla_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"lado" "asiento_linea_lado" NOT NULL,
	"base" "regla_mapeo_base" NOT NULL,
	"importe_fijo" numeric(15, 2),
	"orden" integer DEFAULT 0 NOT NULL,
	"descripcion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"level" "job_log_level" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "agent_message_role" NOT NULL,
	"contenido" text NOT NULL,
	"tool_calls" jsonb,
	"citas" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprobante_alicuota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comprobante_id" uuid NOT NULL,
	"alicuota" numeric(5, 2) NOT NULL,
	"neto" numeric(15, 2) NOT NULL,
	"iva" numeric(15, 2) NOT NULL,
	CONSTRAINT "comprobante_alicuota_comprobante_id_alicuota_key" UNIQUE("comprobante_id","alicuota")
);
--> statement-breakpoint
CREATE TABLE "cliente_empleador_config" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"tipo_empresa_id" uuid,
	"seguro_colectivo" boolean DEFAULT false NOT NULL,
	"mipyme" boolean DEFAULT false NOT NULL,
	"orden_cln" text,
	"situacion_default_id" uuid,
	"condicion_default_id" uuid,
	"actividad_default_id" uuid,
	"modalidad_default_id" uuid,
	"siniestrado_default_id" uuid,
	"zona_default_id" uuid,
	"obra_social_default_id" uuid,
	"firma_empleador_key" text,
	"plantilla_empleado_id" uuid,
	"usa_lsd_referencia" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credencial_afip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cuit" text NOT NULL,
	"clave" text NOT NULL,
	"nombre" text,
	"email" text,
	"telefono" text,
	"estado" "credencial_estado" DEFAULT 'activa' NOT NULL,
	"ultimo_login_ok" timestamp with time zone,
	"verificada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contraparte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_tipo" "documento_tipo" NOT NULL,
	"doc_nro" text NOT NULL,
	"nombre" text,
	"provincia" text,
	"provincia_fuente" "provincia_fuente",
	"provincia_actualizada_at" timestamp with time zone,
	"direccion" text,
	"cod_postal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contraparte_doc_tipo_doc_nro_key" UNIQUE("doc_tipo","doc_nro")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	CONSTRAINT "session_token_key" UNIQUE("token")
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
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	CONSTRAINT "organization_slug_key" UNIQUE("slug")
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
	CONSTRAINT "user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cliente_eecc_config" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"actividad_principal" text,
	"fecha_inscripcion_rpc" date,
	"numero_igj" text,
	"cierre_ejercicio_mes" smallint,
	"firmante_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_cuenta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"activa" boolean,
	"nombre_propio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_cuenta_cliente_id_cuenta_id_key" UNIQUE("cliente_id","cuenta_id")
);
--> statement-breakpoint
CREATE TABLE "cuenta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "cuenta_tipo" NOT NULL,
	"alcance" "cuenta_alcance" DEFAULT 'base' NOT NULL,
	"cliente_id" uuid,
	"padre_id" uuid,
	"descripcion" text,
	"rubro" "cuenta_rubro",
	"saldo_esperado" "cuenta_saldo",
	"funcion_gasto" "cuenta_funcion_gasto",
	"naturaleza_inflacion" "cuenta_naturaleza_inflacion",
	"flujo_efectivo" "cuenta_flujo_efectivo",
	"es_cuenta_sistema" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuenta_org_id_cliente_id_codigo_key" UNIQUE("org_id","codigo","cliente_id"),
	CONSTRAINT "cuenta_alcance_coherente" CHECK (((alcance = 'base'::cuenta_alcance) AND (cliente_id IS NULL)) OR ((alcance = 'propia'::cuenta_alcance) AND (cliente_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "recibo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"empleado_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"tipo" "recibo_tipo" NOT NULL,
	"quincena" smallint DEFAULT 0 NOT NULL,
	"fecha" date,
	"fecha_pago" date,
	"lugar_pago" text,
	"forma_pago" "forma_pago",
	"banco" text,
	"cbu" text,
	"basico" numeric(15, 2),
	"haberes" numeric(15, 2) DEFAULT '0' NOT NULL,
	"no_remunerativo" numeric(15, 2) DEFAULT '0' NOT NULL,
	"descuentos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"retenciones" numeric(15, 2) DEFAULT '0' NOT NULL,
	"neto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"obra_social_id" uuid,
	"periodo_cargas" date,
	"fecha_deposito_cargas" date,
	"situacion_revista_1_id" uuid,
	"situacion_revista_1_dia_inicio" smallint,
	"situacion_revista_2_id" uuid,
	"situacion_revista_2_dia_inicio" smallint,
	"situacion_revista_3_id" uuid,
	"situacion_revista_3_dia_inicio" smallint,
	"dias_trabajados" integer,
	"horas_trabajadas" integer,
	"importe_a_detraer_ley27430" numeric(15, 2),
	"importe_maternidad_art13" numeric(15, 2),
	"contribucion_tarea_diferencial" numeric(15, 2),
	"contribucion_adicional_os" numeric(15, 2),
	"remuneracion_4y8_override" numeric(15, 2),
	"remuneracion_9_override" numeric(15, 2),
	"observacion_recibo" text,
	"observacion_interna" text,
	"confirmado" boolean DEFAULT false NOT NULL,
	"calculado_at" timestamp with time zone,
	"fuente" "dato_fuente" DEFAULT 'calculo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "recibo_empleado_id_periodo_tipo_quincena_fuente_key" UNIQUE("empleado_id","periodo","tipo","quincena","fuente"),
	CONSTRAINT "recibo_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"credencial_id" uuid NOT NULL,
	"cliente_id" uuid,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"failed_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"bull_job_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iva_declaracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"presentada_at" date,
	"debito_fiscal" numeric(15, 2),
	"credito_fiscal" numeric(15, 2),
	"saldo_mes_anterior" numeric(15, 2),
	"saldo_afip_mes" numeric(15, 2),
	"saldo_tecnico_favor" numeric(15, 2),
	"saldo_tecnico_favor_mensual" numeric(15, 2),
	"saldo_libre_disponibilidad_anterior_neto" numeric(15, 2),
	"retenciones_percepciones_periodo" numeric(15, 2),
	"saldo_libre_disponibilidad_favor" numeric(15, 2),
	"fuente" "dato_fuente" DEFAULT 'scraper' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_run_id" uuid,
	CONSTRAINT "iva_declaracion_cliente_id_periodo_key" UNIQUE("cliente_id","periodo"),
	CONSTRAINT "iva_declaracion_ai_coherente" CHECK ((fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "deuda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"credencial_id" uuid NOT NULL,
	"cliente_id" uuid,
	"cuit" text NOT NULL,
	"impuesto" text NOT NULL,
	"concepto" text NOT NULL,
	"sub_concepto" text,
	"periodo" date,
	"cuota" numeric(5, 0),
	"vence_at" date,
	"establecimiento" text,
	"saldo" numeric(15, 2) DEFAULT '0' NOT NULL,
	"interes_resarcitorio" numeric(15, 2) DEFAULT '0' NOT NULL,
	"interes_punitorio" numeric(15, 2) DEFAULT '0' NOT NULL,
	"estado" "deuda_estado" DEFAULT 'abierta' NOT NULL,
	"intimada" boolean DEFAULT false NOT NULL,
	"detectada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vencimiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"credencial_id" uuid NOT NULL,
	"cliente_id" uuid,
	"cuit" text NOT NULL,
	"impuesto" text NOT NULL,
	"concepto" text NOT NULL,
	"sub_concepto" text,
	"periodo" date,
	"cuota" numeric(5, 0),
	"vence_at" date NOT NULL,
	"detalle" text,
	"completado_at" timestamp with time zone,
	"completado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidacion_iibb" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"periodo" date NOT NULL,
	"provincia" text NOT NULL,
	"alicuota" numeric(7, 6) NOT NULL,
	"saldo_a_favor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"percepciones_agentes" numeric(15, 2) DEFAULT '0' NOT NULL,
	"percepciones_aduaneras" numeric(15, 2) DEFAULT '0' NOT NULL,
	"retenciones_agentes" numeric(15, 2) DEFAULT '0' NOT NULL,
	"retenciones_bancarias" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liquidacion_iibb_cliente_id_periodo_provincia_key" UNIQUE("cliente_id","periodo","provincia")
);
--> statement-breakpoint
CREATE TABLE "escala_salarial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"vigencia_desde" date NOT NULL,
	"vigencia_hasta" date,
	"monto_basico" numeric(15, 2) NOT NULL,
	"monto_no_remunerativo" numeric(15, 2) DEFAULT '0' NOT NULL,
	"periodo_label" text,
	"fuente" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escala_salarial_categoria_id_vigencia_desde_key" UNIQUE("categoria_id","vigencia_desde")
);
--> statement-breakpoint
CREATE TABLE "convenio_fuente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"convenio_id" uuid NOT NULL,
	"fuente" text NOT NULL,
	"detalle" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convenio_fuente_convenio_id_fuente_key" UNIQUE("convenio_id","fuente")
);
--> statement-breakpoint
CREATE TABLE "notificacion_adjunto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notificacion_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificacion_adjunto_notificacion_id_documento_id_key" UNIQUE("notificacion_id","documento_id")
);
--> statement-breakpoint
CREATE TABLE "tipo_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipo_empresa_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "anexo_cmv" ADD CONSTRAINT "anexo_cmv_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo_cmv" ADD CONSTRAINT "anexo_cmv_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."ejercicio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo_cmv" ADD CONSTRAINT "anexo_cmv_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_decidido_por_fkey" FOREIGN KEY ("decidido_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo_concepto" ADD CONSTRAINT "recibo_concepto_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "public"."concepto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo_concepto" ADD CONSTRAINT "recibo_concepto_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "public"."recibo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convenio_categoria" ADD CONSTRAINT "convenio_categoria_convenio_id_fkey" FOREIGN KEY ("convenio_id") REFERENCES "public"."convenio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bien_de_uso" ADD CONSTRAINT "bien_de_uso_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bien_de_uso" ADD CONSTRAINT "bien_de_uso_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bien_de_uso" ADD CONSTRAINT "bien_de_uso_cuenta_amortizacion_acumulada_id_fkey" FOREIGN KEY ("cuenta_amortizacion_acumulada_id") REFERENCES "public"."cuenta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bien_de_uso" ADD CONSTRAINT "bien_de_uso_cuenta_amortizacion_gasto_id_fkey" FOREIGN KEY ("cuenta_amortizacion_gasto_id") REFERENCES "public"."cuenta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bien_de_uso" ADD CONSTRAINT "bien_de_uso_cuenta_bien_id_fkey" FOREIGN KEY ("cuenta_bien_id") REFERENCES "public"."cuenta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bien_de_uso" ADD CONSTRAINT "bien_de_uso_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejercicio" ADD CONSTRAINT "ejercicio_cerrado_por_fkey" FOREIGN KEY ("cerrado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejercicio" ADD CONSTRAINT "ejercicio_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejercicio" ADD CONSTRAINT "ejercicio_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejercicio" ADD CONSTRAINT "ejercicio_reabierto_por_fkey" FOREIGN KEY ("reabierto_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_bancario" ADD CONSTRAINT "movimiento_bancario_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_bancario" ADD CONSTRAINT "movimiento_bancario_contraparte_id_fkey" FOREIGN KEY ("contraparte_id") REFERENCES "public"."contraparte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_bancario" ADD CONSTRAINT "movimiento_bancario_cuenta_bancaria_id_fkey" FOREIGN KEY ("cuenta_bancaria_id") REFERENCES "public"."cuenta_bancaria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta_bancaria" ADD CONSTRAINT "cuenta_bancaria_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta_bancaria" ADD CONSTRAINT "cuenta_bancaria_cuenta_contable_id_fkey" FOREIGN KEY ("cuenta_contable_id") REFERENCES "public"."cuenta"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta_bancaria" ADD CONSTRAINT "cuenta_bancaria_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_credencial" ADD CONSTRAINT "cliente_credencial_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_credencial" ADD CONSTRAINT "cliente_credencial_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_contraparte_id_fkey" FOREIGN KEY ("contraparte_id") REFERENCES "public"."contraparte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_tipo_fkey" FOREIGN KEY ("tipo") REFERENCES "public"."comprobante_tipo"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_asignada_a_fkey" FOREIGN KEY ("asignada_a") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_origen_job_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_resuelta_por_fkey" FOREIGN KEY ("resuelta_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_pedida_por_fkey" FOREIGN KEY ("pedida_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riesgo_snapshot" ADD CONSTRAINT "riesgo_snapshot_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyeccion_impuesto" ADD CONSTRAINT "proyeccion_impuesto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_asignada_a_fkey" FOREIGN KEY ("asignada_a") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_resuelta_por_fkey" FOREIGN KEY ("resuelta_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_concepto" ADD CONSTRAINT "cliente_concepto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_concepto" ADD CONSTRAINT "cliente_concepto_concepto_afip_id_fkey" FOREIGN KEY ("concepto_afip_id") REFERENCES "public"."concepto_afip"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_concepto" ADD CONSTRAINT "cliente_concepto_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "public"."concepto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_concepto" ADD CONSTRAINT "cliente_concepto_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepto" ADD CONSTRAINT "concepto_codigo_afip_fkey" FOREIGN KEY ("codigo_afip") REFERENCES "public"."concepto_afip"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convenio" ADD CONSTRAINT "convenio_cct_codigo_fkey" FOREIGN KEY ("cct_codigo") REFERENCES "public"."cct"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convenio" ADD CONSTRAINT "convenio_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convenio" ADD CONSTRAINT "convenio_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "public"."actividad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."convenio_categoria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_condicion_id_fkey" FOREIGN KEY ("condicion_id") REFERENCES "public"."condicion_trabajador"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_convenio_id_fkey" FOREIGN KEY ("convenio_id") REFERENCES "public"."convenio"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_localidad_id_fkey" FOREIGN KEY ("localidad_id") REFERENCES "public"."localidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_modalidad_contratacion_id_fkey" FOREIGN KEY ("modalidad_contratacion_id") REFERENCES "public"."modalidad_contratacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_nacionalidad_id_fkey" FOREIGN KEY ("nacionalidad_id") REFERENCES "public"."nacionalidad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_obra_social_id_fkey" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obra_social"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_provincia_id_fkey" FOREIGN KEY ("provincia_id") REFERENCES "public"."provincia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_siniestrado_id_fkey" FOREIGN KEY ("siniestrado_id") REFERENCES "public"."siniestrado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_situacion_id_fkey" FOREIGN KEY ("situacion_id") REFERENCES "public"."situacion_revista"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "public"."zona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_cct" ADD CONSTRAINT "cliente_cct_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_cct" ADD CONSTRAINT "cliente_cct_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lsd_presentacion" ADD CONSTRAINT "lsd_presentacion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lsd_presentacion" ADD CONSTRAINT "lsd_presentacion_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."ejercicio"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodo_contable"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento" ADD CONSTRAINT "asiento_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "public"."regla_mapeo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_mapeo" ADD CONSTRAINT "regla_mapeo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_mapeo" ADD CONSTRAINT "regla_mapeo_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodo_contable" ADD CONSTRAINT "periodo_contable_cerrado_por_fkey" FOREIGN KEY ("cerrado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodo_contable" ADD CONSTRAINT "periodo_contable_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodo_contable" ADD CONSTRAINT "periodo_contable_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."ejercicio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eecc" ADD CONSTRAINT "eecc_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eecc" ADD CONSTRAINT "eecc_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eecc" ADD CONSTRAINT "eecc_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."ejercicio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eecc" ADD CONSTRAINT "eecc_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eecc" ADD CONSTRAINT "eecc_pdf_generado_por_fkey" FOREIGN KEY ("pdf_generado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmante" ADD CONSTRAINT "firmante_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacion_comprobante" ADD CONSTRAINT "conciliacion_comprobante_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacion_comprobante" ADD CONSTRAINT "conciliacion_comprobante_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacion_comprobante" ADD CONSTRAINT "conciliacion_comprobante_movimiento_bancario_id_fkey" FOREIGN KEY ("movimiento_bancario_id") REFERENCES "public"."movimiento_bancario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conciliacion_comprobante" ADD CONSTRAINT "conciliacion_comprobante_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceso_usuario_cliente" ADD CONSTRAINT "acceso_usuario_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceso_usuario_cliente" ADD CONSTRAINT "acceso_usuario_cliente_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_module" ADD CONSTRAINT "organization_module_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento_linea" ADD CONSTRAINT "asiento_linea_asiento_id_fkey" FOREIGN KEY ("asiento_id") REFERENCES "public"."asiento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asiento_linea" ADD CONSTRAINT "asiento_linea_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_mapeo_linea" ADD CONSTRAINT "regla_mapeo_linea_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_mapeo_linea" ADD CONSTRAINT "regla_mapeo_linea_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "public"."regla_mapeo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_log" ADD CONSTRAINT "job_log_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobante_alicuota" ADD CONSTRAINT "comprobante_alicuota_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "public"."comprobante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_empleador_config" ADD CONSTRAINT "cliente_empleador_config_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credencial_afip" ADD CONSTRAINT "credencial_afip_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_eecc_config" ADD CONSTRAINT "cliente_eecc_config_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_eecc_config" ADD CONSTRAINT "cliente_eecc_config_firmante_fk" FOREIGN KEY ("firmante_id") REFERENCES "public"."firmante"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_cuenta" ADD CONSTRAINT "cliente_cuenta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_cuenta" ADD CONSTRAINT "cliente_cuenta_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuenta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta" ADD CONSTRAINT "cuenta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta" ADD CONSTRAINT "cuenta_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta" ADD CONSTRAINT "cuenta_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "public"."cuenta"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_obra_social_id_fkey" FOREIGN KEY ("obra_social_id") REFERENCES "public"."obra_social"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_situacion_revista_1_id_fkey" FOREIGN KEY ("situacion_revista_1_id") REFERENCES "public"."situacion_revista"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_situacion_revista_2_id_fkey" FOREIGN KEY ("situacion_revista_2_id") REFERENCES "public"."situacion_revista"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibo" ADD CONSTRAINT "recibo_situacion_revista_3_id_fkey" FOREIGN KEY ("situacion_revista_3_id") REFERENCES "public"."situacion_revista"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iva_declaracion" ADD CONSTRAINT "iva_declaracion_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."agent_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iva_declaracion" ADD CONSTRAINT "iva_declaracion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deuda" ADD CONSTRAINT "deuda_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deuda" ADD CONSTRAINT "deuda_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deuda" ADD CONSTRAINT "deuda_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vencimiento" ADD CONSTRAINT "vencimiento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vencimiento" ADD CONSTRAINT "vencimiento_completado_por_fkey" FOREIGN KEY ("completado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vencimiento" ADD CONSTRAINT "vencimiento_credencial_id_fkey" FOREIGN KEY ("credencial_id") REFERENCES "public"."credencial_afip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vencimiento" ADD CONSTRAINT "vencimiento_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_iibb" ADD CONSTRAINT "liquidacion_iibb_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion_iibb" ADD CONSTRAINT "liquidacion_iibb_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escala_salarial" ADD CONSTRAINT "escala_salarial_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."convenio_categoria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convenio_fuente" ADD CONSTRAINT "convenio_fuente_convenio_id_fkey" FOREIGN KEY ("convenio_id") REFERENCES "public"."convenio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion_adjunto" ADD CONSTRAINT "notificacion_adjunto_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "public"."documento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion_adjunto" ADD CONSTRAINT "notificacion_adjunto_notificacion_id_fkey" FOREIGN KEY ("notificacion_id") REFERENCES "public"."notificacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_conversation_org" ON "agent_conversation" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_conversation_user" ON "agent_conversation" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_run_cliente" ON "agent_run" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_run_conversation" ON "agent_run" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_run_org" ON "agent_run" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_action_cliente" ON "agent_action" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_action_org" ON "agent_action" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_action_pendientes" ON "agent_action" USING btree ("estado" enum_ops) WHERE (estado = 'propuesta'::agent_action_estado);--> statement-breakpoint
CREATE INDEX "idx_agent_action_run" ON "agent_action" USING btree ("agent_run_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_recibo_concepto_concepto" ON "recibo_concepto" USING btree ("concepto_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_recibo_concepto_recibo" ON "recibo_concepto" USING btree ("recibo_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_convenio_categoria_convenio" ON "convenio_categoria" USING btree ("convenio_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_bien_de_uso_cliente" ON "bien_de_uso" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ejercicio_cliente" ON "ejercicio" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_movimiento_bancario_ai_run" ON "movimiento_bancario" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_movimiento_bancario_contraparte" ON "movimiento_bancario" USING btree ("contraparte_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_movimiento_bancario_cuenta" ON "movimiento_bancario" USING btree ("cuenta_bancaria_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_movimiento_bancario_externo" ON "movimiento_bancario" USING btree ("cuenta_bancaria_id" text_ops,"id_externo" text_ops) WHERE (id_externo IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_movimiento_bancario_fecha" ON "movimiento_bancario" USING btree ("fecha" date_ops);--> statement-breakpoint
CREATE INDEX "idx_movimiento_bancario_periodo" ON "movimiento_bancario" USING btree ("periodo" date_ops);--> statement-breakpoint
CREATE INDEX "idx_invitation_inviter" ON "invitation" USING btree ("inviter_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_invitation_org" ON "invitation" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_member_org" ON "member" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_member_user" ON "member" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cuenta_bancaria_cbu" ON "cuenta_bancaria" USING btree ("cbu" text_ops) WHERE (cbu IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_cuenta_bancaria_cliente" ON "cuenta_bancaria" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cuenta_bancaria_org" ON "cuenta_bancaria" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_credencial_cliente" ON "cliente_credencial" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_credencial_credencial" ON "cliente_credencial" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_org" ON "cliente" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_evento_cliente" ON "evento" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_evento_entidad" ON "evento" USING btree ("entidad" uuid_ops,"entidad_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_evento_org" ON "evento" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_comprobante_ai_run" ON "comprobante" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_comprobante_cliente_periodo" ON "comprobante" USING btree ("cliente_id" date_ops,"periodo" date_ops);--> statement-breakpoint
CREATE INDEX "idx_comprobante_contraparte" ON "comprobante" USING btree ("contraparte_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_comprobante_fecha" ON "comprobante" USING btree ("fecha_emision" date_ops);--> statement-breakpoint
CREATE INDEX "idx_comprobante_org" ON "comprobante" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_alerta_cliente" ON "alerta" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_alerta_credencial" ON "alerta" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_alerta_estado" ON "alerta" USING btree ("estado" enum_ops) WHERE (estado = 'abierta'::alerta_estado);--> statement-breakpoint
CREATE INDEX "idx_alerta_org" ON "alerta" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_alerta_origen" ON "alerta" USING btree ("origen_tipo" enum_ops,"origen_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_solicitud_cliente" ON "solicitud" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_solicitud_estado" ON "solicitud" USING btree ("estado" enum_ops) WHERE (estado = 'abierta'::solicitud_estado);--> statement-breakpoint
CREATE INDEX "idx_solicitud_org" ON "solicitud" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_riesgo_snapshot_cliente" ON "riesgo_snapshot" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_proyeccion_cliente" ON "proyeccion_impuesto" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notificacion_cliente" ON "notificacion" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notificacion_credencial" ON "notificacion" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notificacion_org" ON "notificacion" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_concepto_cliente" ON "cliente_concepto" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_concepto_concepto" ON "cliente_concepto" USING btree ("concepto_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_convenio_cliente" ON "convenio" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_empleado_ai_run" ON "empleado" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_empleado_cliente" ON "empleado" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_empleado_cuil" ON "empleado" USING btree ("cuil" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_cct_cliente" ON "cliente_cct" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_lsd_presentacion_cliente" ON "lsd_presentacion" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_asiento_ai_run" ON "asiento" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_asiento_cliente_fecha" ON "asiento" USING btree ("cliente_id" date_ops,"fecha" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_asiento_origen" ON "asiento" USING btree ("origen_tipo" enum_ops,"origen_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_asiento_periodo" ON "asiento" USING btree ("periodo_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_regla_mapeo_cliente" ON "regla_mapeo" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_periodo_ejercicio" ON "periodo_contable" USING btree ("ejercicio_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_eecc_cliente" ON "eecc" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_firmante_org" ON "firmante" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conciliacion_comprobante" ON "conciliacion_comprobante" USING btree ("comprobante_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conciliacion_comprobante_ai_run" ON "conciliacion_comprobante" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_conciliacion_movimiento" ON "conciliacion_comprobante" USING btree ("movimiento_bancario_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documento_ai_run" ON "documento" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_documento_cliente" ON "documento" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documento_credencial" ON "documento" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_documento_org" ON "documento" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_documento_storage_key" ON "documento" USING btree ("storage_key" text_ops) WHERE (storage_key IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_acceso_cliente" ON "acceso_usuario_cliente" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_acceso_usuario" ON "acceso_usuario_cliente" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_asiento_linea_asiento" ON "asiento_linea" USING btree ("asiento_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_asiento_linea_cuenta" ON "asiento_linea" USING btree ("cuenta_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_regla_mapeo_linea_regla" ON "regla_mapeo_linea" USING btree ("regla_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_job_log_job" ON "job_log" USING btree ("job_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_job_log_nivel" ON "job_log" USING btree ("level" enum_ops) WHERE (level = ANY (ARRAY['warn'::job_log_level, 'error'::job_log_level]));--> statement-breakpoint
CREATE INDEX "idx_agent_message_conversation" ON "agent_message" USING btree ("conversation_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_comprobante_alicuota_comprobante" ON "comprobante_alicuota" USING btree ("comprobante_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_credencial_afip_org" ON "credencial_afip" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_user" ON "session" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_account_user" ON "account" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cliente_cuenta_cliente" ON "cliente_cuenta" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cuenta_cliente" ON "cuenta" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cuenta_org" ON "cuenta" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cuenta_padre" ON "cuenta" USING btree ("padre_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_recibo_ai_run" ON "recibo" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_recibo_cliente_periodo" ON "recibo" USING btree ("cliente_id" uuid_ops,"periodo" date_ops);--> statement-breakpoint
CREATE INDEX "idx_recibo_empleado" ON "recibo" USING btree ("empleado_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_job_cliente" ON "job" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_job_created" ON "job" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_job_credencial" ON "job" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_job_org" ON "job" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_job_status" ON "job" USING btree ("status" enum_ops) WHERE (status = ANY (ARRAY['pending'::job_status, 'running'::job_status]));--> statement-breakpoint
CREATE INDEX "idx_iva_declaracion_ai_run" ON "iva_declaracion" USING btree ("ai_run_id" uuid_ops) WHERE (ai_run_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_deuda_cliente" ON "deuda" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_deuda_credencial" ON "deuda" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_deuda_org" ON "deuda" USING btree ("org_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_vencimiento_cliente" ON "vencimiento" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_vencimiento_credencial" ON "vencimiento" USING btree ("credencial_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_vencimiento_vence" ON "vencimiento" USING btree ("vence_at" date_ops);--> statement-breakpoint
CREATE INDEX "idx_liquidacion_iibb_cliente" ON "liquidacion_iibb" USING btree ("cliente_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_escala_categoria" ON "escala_salarial" USING btree ("categoria_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_convenio_fuente_convenio" ON "convenio_fuente" USING btree ("convenio_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notificacion_adjunto_documento" ON "notificacion_adjunto" USING btree ("documento_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notificacion_adjunto_notificacion" ON "notificacion_adjunto" USING btree ("notificacion_id" uuid_ops);
*/