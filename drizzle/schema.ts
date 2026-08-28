/**
 * GENERADO — no editar a mano.
 *
 * Fuente de verdad: el SQL de BD_IDEAL (src/scripts/ideal/schema-dominio*.sql).
 * Para regenerar:
 *   bunx drizzle-kit pull --config drizzle.ideal.config.ts
 *   bun src/scripts/ideal/gen-schema.ts
 */
import { pgTable, index, unique, check, uuid, integer, numeric, timestamp, text, foreignKey, pgPolicy, boolean, date, uniqueIndex, char, smallint, jsonb, bigint, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user, organization } from "./auth"

export const accesoRol = pgEnum("acceso_rol", ['cliente_lector'])
export const tareaEstado = pgEnum("tarea_estado", ['pendiente', 'presentada', 'verificada'])
export const tareaTipo = pgEnum("tarea_tipo", ['iva', 'iibb', 'ddjj', 'sueldos', 'convenios', 'otro'])
export const actorTipo = pgEnum("actor_tipo", ['user', 'job', 'agent'])
export const agentActionEstado = pgEnum("agent_action_estado", ['propuesta', 'aprobada', 'rechazada', 'ejecutada'])
export const agentMessageRole = pgEnum("agent_message_role", ['user', 'assistant', 'system', 'tool'])
export const agentRunResultado = pgEnum("agent_run_resultado", ['ok', 'error', 'cancelado'])
export const agentRunTipo = pgEnum("agent_run_tipo", ['chat', 'alerta', 'clasificacion', 'proyeccion', 'revision'])
export const ajusteInflacionEstado = pgEnum("ajuste_inflacion_estado", ['borrador', 'aplicado'])
export const alertaEstado = pgEnum("alerta_estado", ['abierta', 'resuelta'])
export const alertaOrigen = pgEnum("alerta_origen", ['job'])
export const alertaSeveridad = pgEnum("alerta_severidad", ['baja', 'media', 'alta', 'critica'])
export const alertaTipo = pgEnum("alerta_tipo", ['error_scraping'])
export const asientoLineaLado = pgEnum("asiento_linea_lado", ['debe', 'haber'])
export const asientoOrigenTipo = pgEnum("asiento_origen_tipo", ['manual', 'comprobante', 'recibo', 'movimiento_bancario', 'cierre', 'apertura', 'import', 'ajuste_inflacion'])
export const bienUsoCategoria = pgEnum("bien_uso_categoria", ['rodados', 'muebles_utiles', 'equipos_computacion', 'instalaciones', 'inmuebles', 'maquinarias', 'otros'])
export const bienUsoEstado = pgEnum("bien_uso_estado", ['activo', 'vendido', 'baja'])
export const bienUsoMetodo = pgEnum("bien_uso_metodo", ['lineal'])
export const bienUsoMotivoBaja = pgEnum("bien_uso_motivo_baja", ['venta', 'desuso', 'destruccion'])
export const clienteEstado = pgEnum("cliente_estado", ['activo', 'pausado', 'baja'])
export const comprobanteClase = pgEnum("comprobante_clase", ['factura', 'nota_credito', 'nota_debito', 'recibo', 'tique'])
export const comprobanteDireccion = pgEnum("comprobante_direccion", ['emitido', 'recibido'])
export const conceptoModoCalculo = pgEnum("concepto_modo_calculo", ['importe_manual', 'pct_sobre_base', 'pct_sobre_concepto', 'sueldo_basico', 'valor_hora', 'sac', 'sac_proporcional', 'dia_vacaciones', 'promedio_anual_concepto'])
export const conceptoTipo = pgEnum("concepto_tipo", ['remunerativo', 'no_remunerativo', 'descuento', 'retencion'])
export const conciliacionEstado = pgEnum("conciliacion_estado", ['sugerida', 'confirmada', 'rechazada'])
export const condicionIva = pgEnum("condicion_iva", ['responsable_inscripto', 'monotributista', 'exento', 'no_alcanzado'])
export const confianza = pgEnum("confianza", ['baja', 'media', 'alta'])
export const credencialEstado = pgEnum("credencial_estado", ['activa', 'clave_invalida', 'bloqueada'])
export const cuentaAlcance = pgEnum("cuenta_alcance", ['base', 'propia'])
export const cuentaBancariaTipo = pgEnum("cuenta_bancaria_tipo", ['caja_ahorro', 'cuenta_corriente', 'otra'])
export const cuentaFlujoEfectivo = pgEnum("cuenta_flujo_efectivo", ['operativa', 'inversion', 'financiacion'])
export const cuentaFuncionGasto = pgEnum("cuenta_funcion_gasto", ['administracion', 'comercializacion', 'financiero', 'otro'])
export const cuentaNaturalezaInflacion = pgEnum("cuenta_naturaleza_inflacion", ['monetaria', 'no_monetaria', 'no_monetaria_costo', 'no_monetaria_valor_corriente', 'resultado_por_diferencia'])
export const cuentaRubro = pgEnum("cuenta_rubro", ['caja_bancos', 'inversiones_temporarias', 'creditos_ventas', 'otros_creditos_cte', 'bienes_cambio', 'otros_activos_cte', 'creditos_largo_plazo', 'bienes_uso', 'intangibles', 'inversiones_permanentes', 'otros_activos_no_cte', 'deudas_comerciales', 'deudas_financieras', 'deudas_sociales', 'deudas_fiscales', 'otras_deudas_cte', 'deudas_largo_plazo', 'previsiones', 'capital', 'aportes_irrevocables', 'primas_emision', 'reservas', 'resultados_no_asignados', 'resultado_ejercicio', 'ventas', 'costo_ventas', 'gastos_administracion', 'gastos_comercializacion', 'gastos_financieros', 'otros_resultados_pos', 'otros_resultados_neg', 'impuesto_ganancias'])
export const cuentaSaldo = pgEnum("cuenta_saldo", ['deudor', 'acreedor', 'ambos'])
export const cuentaTipo = pgEnum("cuenta_tipo", ['imputable', 'grupo'])
export const datoFuente = pgEnum("dato_fuente", ['scraper', 'manual', 'import', 'ai', 'calculo'])
export const deudaEstado = pgEnum("deuda_estado", ['abierta', 'pagada', 'plan_pago', 'prescripta'])
export const documentoTipo = pgEnum("documento_tipo", ['cuit', 'dni', 'otro'])
export const eeccEstado = pgEnum("eecc_estado", ['borrador', 'aprobado'])
export const ejercicioEstado = pgEnum("ejercicio_estado", ['abierto', 'en_cierre', 'cerrado'])
export const eventoTipo = pgEnum("evento_tipo", ['alta', 'cambio', 'baja', 'deteccion'])
export const formaPago = pgEnum("forma_pago", ['efectivo', 'deposito', 'transferencia', 'cheque'])
export const iibbRegimen = pgEnum("iibb_regimen", ['local', 'convenio_multilateral'])
export const impuesto = pgEnum("impuesto", ['iva', 'ganancias', 'ingresos_brutos', 'cargas_sociales'])
export const indiceInflacionFuente = pgEnum("indice_inflacion_fuente", ['facpce_rt6', 'indec_ipc', 'manual'])
export const jobLogLevel = pgEnum("job_log_level", ['debug', 'info', 'warn', 'error'])
export const jobStatus = pgEnum("job_status", ['pending', 'running', 'failed', 'finished'])
export const jobType = pgEnum("job_type", ['iva', 'comprobantes', 'comprobantes_full', 'notificaciones', 'deuda', 'vencimientos', 'batch', 'escalas', 'tope_imponible'])
export const marcoContable = pgEnum("marco_contable", ['rt54', 'rt6'])
export const movimientoDireccion = pgEnum("movimiento_direccion", ['ingreso', 'egreso'])
export const notificacionSeveridad = pgEnum("notificacion_severidad", ['sin_clasificar', 'informativa', 'accion_requerida', 'urgente'])
export const orgModule = pgEnum("org_module", ['sueldos', 'banco', 'contabilidad', 'analytics', 'portal_cliente', 'ai_agent'])
export const periodoEstado = pgEnum("periodo_estado", ['abierto', 'cerrado'])
export const provinciaFuente = pgEnum("provincia_fuente", ['padron', 'nosis', 'manual'])
export const reciboTipo = pgEnum("recibo_tipo", ['mensual', 'quincenal', 'sac', 'liquidacion_final', 'vacaciones', 'anticipo', 'comisiones', 'fondo_desempleo', 'otros'])
export const reglaMapeoBase = pgEnum("regla_mapeo_base", ['total', 'neto', 'iva', 'otros_tributos', 'valor_concepto', 'fijo'])
export const reglaMapeoModulo = pgEnum("regla_mapeo_modulo", ['comprobante', 'recibo', 'movimiento_bancario'])
export const reglaMapeoTipo = pgEnum("regla_mapeo_tipo", ['default', 'condicional'])
export const relacionFuente = pgEnum("relacion_fuente", ['discovery', 'manual'])
export const riesgoNivel = pgEnum("riesgo_nivel", ['bajo', 'medio', 'alto', 'critico'])
export const sexo = pgEnum("sexo", ['masculino', 'femenino'])
export const solicitudEstado = pgEnum("solicitud_estado", ['abierta', 'completada', 'cancelada'])
export const solicitudTipo = pgEnum("solicitud_tipo", ['documentacion', 'informacion', 'pago', 'otra'])
export const tipoJornada = pgEnum("tipo_jornada", ['full_time', 'part_time', 'reducida'])
export const tipoPersona = pgEnum("tipo_persona", ['fisica', 'juridica'])


export const indiceInflacion = pgTable("indice_inflacion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fuente: indiceInflacionFuente().default('facpce_rt6').notNull(),
	anio: integer().notNull(),
	mes: integer().notNull(),
	valor: numeric({ precision: 20, scale:  6 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_indice_inflacion_periodo").using("btree", table.anio.asc().nullsLast().op("int4_ops"), table.mes.asc().nullsLast().op("int4_ops")),
	unique("indice_inflacion_fuente_anio_mes_key").on(table.fuente, table.anio, table.mes),
	check("indice_inflacion_mes_check", sql`(mes >= 1) AND (mes <= 12)`),
]);

export const actividad = pgTable("actividad", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("actividad_codigo_key").on(table.codigo),
]);

export const agentConversation = pgTable("agent_conversation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	userId: text("user_id").notNull(),
	clienteId: uuid("cliente_id"),
	titulo: text().default('Nueva conversación').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_conversation_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("idx_agent_conversation_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "agent_conversation_cliente_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "agent_conversation_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "agent_conversation_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const clienteCredencial = pgTable("cliente_credencial", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clienteId: uuid("cliente_id").notNull(),
	credencialId: uuid("credencial_id").notNull(),
	fuente: relacionFuente().default('manual').notNull(),
	afipContribuyenteId: integer("afip_contribuyente_id"),
	preferida: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_cliente_credencial_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_cliente_credencial_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cliente_credencial_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "cliente_credencial_credencial_id_fkey"
		}).onDelete("cascade"),
	unique("cliente_credencial_cliente_id_credencial_id_key").on(table.clienteId, table.credencialId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_credencial.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_credencial.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const plantillaInformeAuditor = pgTable("plantilla_informe_auditor", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	nombre: text().notNull(),
	cuerpo: text().notNull(),
	esDefault: boolean("es_default").default(false).notNull(),
	creadoPor: text("creado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_plantilla_informe_auditor_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "plantilla_informe_auditor_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creadoPor],
			foreignColumns: [user.id],
			name: "plantilla_informe_auditor_creado_por_fkey"
		}).onDelete("set null"),
	unique("plantilla_informe_auditor_org_id_nombre_key").on(table.orgId, table.nombre),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const ajusteInflacion = pgTable("ajuste_inflacion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	ejercicioId: uuid("ejercicio_id").notNull(),
	fuente: indiceInflacionFuente().default('facpce_rt6').notNull(),
	cierreAnio: integer("cierre_anio").notNull(),
	cierreMes: integer("cierre_mes").notNull(),
	aperturaAnio: integer("apertura_anio").notNull(),
	aperturaMes: integer("apertura_mes").notNull(),
	estado: ajusteInflacionEstado().default('borrador').notNull(),
	recpam: numeric({ precision: 20, scale:  2 }).default('0').notNull(),
	asientoId: uuid("asiento_id"),
	aplicadoAt: timestamp("aplicado_at", { withTimezone: true }),
	aplicadoPor: text("aplicado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_ajuste_inflacion_asiento").using("btree", table.asientoId.asc().nullsLast().op("uuid_ops")),
	index("idx_ajuste_inflacion_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_ajuste_inflacion_ejercicio").using("btree", table.ejercicioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "ajuste_inflacion_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "ajuste_inflacion_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ejercicioId],
			foreignColumns: [ejercicio.id],
			name: "ajuste_inflacion_ejercicio_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.asientoId],
			foreignColumns: [asiento.id],
			name: "ajuste_inflacion_asiento_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.aplicadoPor],
			foreignColumns: [user.id],
			name: "ajuste_inflacion_aplicado_por_fkey"
		}).onDelete("set null"),
	unique("ajuste_inflacion_ejercicio_id_key").on(table.ejercicioId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	check("ajuste_inflacion_cierre_mes_check", sql`(cierre_mes >= 1) AND (cierre_mes <= 12)`),
	check("ajuste_inflacion_apertura_mes_check", sql`(apertura_mes >= 1) AND (apertura_mes <= 12)`),
]);

export const ajusteInflacionLinea = pgTable("ajuste_inflacion_linea", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ajusteId: uuid("ajuste_id").notNull(),
	cuentaId: uuid("cuenta_id").notNull(),
	anio: integer(),
	mes: integer(),
	esApertura: boolean("es_apertura").default(false).notNull(),
	historico: numeric({ precision: 20, scale:  2 }).notNull(),
	coeficiente: numeric({ precision: 20, scale:  6 }).notNull(),
	ajustado: numeric({ precision: 20, scale:  2 }).notNull(),
	diferencia: numeric({ precision: 20, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_ajuste_inflacion_linea_ajuste").using("btree", table.ajusteId.asc().nullsLast().op("uuid_ops")),
	index("idx_ajuste_inflacion_linea_cuenta").using("btree", table.cuentaId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ajusteId],
			foreignColumns: [ajusteInflacion.id],
			name: "ajuste_inflacion_linea_ajuste_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cuentaId],
			foreignColumns: [cuenta.id],
			name: "ajuste_inflacion_linea_cuenta_id_fkey"
		}).onDelete("restrict"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM ajuste_inflacion p
  WHERE ((p.id = ajuste_inflacion_linea.ajuste_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM ajuste_inflacion p
  WHERE ((p.id = ajuste_inflacion_linea.ajuste_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	check("ajuste_inflacion_linea_mes_check", sql`(mes >= 1) AND (mes <= 12)`),
]);

export const bienDeUso = pgTable("bien_de_uso", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	nombre: text().notNull(),
	categoria: bienUsoCategoria().notNull(),
	cuentaBienId: uuid("cuenta_bien_id").notNull(),
	cuentaAmortizacionAcumuladaId: uuid("cuenta_amortizacion_acumulada_id").notNull(),
	cuentaAmortizacionGastoId: uuid("cuenta_amortizacion_gasto_id").notNull(),
	fechaAlta: date("fecha_alta").notNull(),
	valorOrigen: numeric("valor_origen", { precision: 15, scale:  2 }).notNull(),
	vidaUtilAnios: integer("vida_util_anios").notNull(),
	valorResidual: numeric("valor_residual", { precision: 15, scale:  2 }).default('0').notNull(),
	metodo: bienUsoMetodo().default('lineal').notNull(),
	estado: bienUsoEstado().default('activo').notNull(),
	fechaBaja: date("fecha_baja"),
	motivoBaja: bienUsoMotivoBaja("motivo_baja"),
	creadoPor: text("creado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_bien_de_uso_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "bien_de_uso_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creadoPor],
			foreignColumns: [user.id],
			name: "bien_de_uso_creado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.cuentaAmortizacionAcumuladaId],
			foreignColumns: [cuenta.id],
			name: "bien_de_uso_cuenta_amortizacion_acumulada_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.cuentaAmortizacionGastoId],
			foreignColumns: [cuenta.id],
			name: "bien_de_uso_cuenta_amortizacion_gasto_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.cuentaBienId],
			foreignColumns: [cuenta.id],
			name: "bien_de_uso_cuenta_bien_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "bien_de_uso_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const cierreSueldos = pgTable("cierre_sueldos", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	periodo: date().notNull(),
	asientoId: uuid("asiento_id"),
	recibos: integer().default(0).notNull(),
	conceptosSinRegla: integer("conceptos_sin_regla").default(0).notNull(),
	cerradoAt: timestamp("cerrado_at", { withTimezone: true }).defaultNow().notNull(),
	cerradoPor: text("cerrado_por"),
	reabiertoAt: timestamp("reabierto_at", { withTimezone: true }),
	reabiertoPor: text("reabierto_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_cierre_sueldos_asiento").using("btree", table.asientoId.asc().nullsLast().op("uuid_ops")),
	index("idx_cierre_sueldos_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_cierre_sueldos_vigente").using("btree", table.clienteId.asc().nullsLast().op("date_ops"), table.periodo.asc().nullsLast().op("date_ops")).where(sql`(reabierto_at IS NULL)`),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "cierre_sueldos_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cierre_sueldos_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.asientoId],
			foreignColumns: [asiento.id],
			name: "cierre_sueldos_asiento_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.cerradoPor],
			foreignColumns: [user.id],
			name: "cierre_sueldos_cerrado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.reabiertoPor],
			foreignColumns: [user.id],
			name: "cierre_sueldos_reabierto_por_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const cuentaBancaria = pgTable("cuenta_bancaria", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	banco: text().notNull(),
	tipo: cuentaBancariaTipo(),
	numero: text(),
	cbu: text(),
	alias: text(),
	moneda: char({ length: 3 }).default('ARS').notNull(),
	cuentaContableId: uuid("cuenta_contable_id"),
	activa: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_cuenta_bancaria_cbu").using("btree", table.cbu.asc().nullsLast().op("text_ops")).where(sql`(cbu IS NOT NULL)`),
	index("idx_cuenta_bancaria_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_cuenta_bancaria_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cuenta_bancaria_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cuentaContableId],
			foreignColumns: [cuenta.id],
			name: "cuenta_bancaria_cuenta_contable_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "cuenta_bancaria_org_id_fkey"
		}).onDelete("cascade"),
	unique("cuenta_bancaria_cliente_id_banco_numero_key").on(table.clienteId, table.banco, table.numero),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const siniestrado = pgTable("siniestrado", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("siniestrado_codigo_key").on(table.codigo),
]);

export const modalidadContratacion = pgTable("modalidad_contratacion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("modalidad_contratacion_codigo_key").on(table.codigo),
]);

export const periodoContable = pgTable("periodo_contable", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clienteId: uuid("cliente_id").notNull(),
	ejercicioId: uuid("ejercicio_id").notNull(),
	periodo: date().notNull(),
	estado: periodoEstado().default('abierto').notNull(),
	cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
	cerradoPor: text("cerrado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_periodo_ejercicio").using("btree", table.ejercicioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cerradoPor],
			foreignColumns: [user.id],
			name: "periodo_contable_cerrado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "periodo_contable_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ejercicioId],
			foreignColumns: [ejercicio.id],
			name: "periodo_contable_ejercicio_id_fkey"
		}).onDelete("cascade"),
	unique("periodo_contable_cliente_id_periodo_key").on(table.clienteId, table.periodo),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = periodo_contable.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = periodo_contable.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const situacionRevista = pgTable("situacion_revista", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("situacion_revista_codigo_key").on(table.codigo),
]);

export const zona = pgTable("zona", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("zona_codigo_key").on(table.codigo),
]);

export const recibo = pgTable("recibo", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	empleadoId: uuid("empleado_id").notNull(),
	periodo: date().notNull(),
	tipo: reciboTipo().notNull(),
	quincena: smallint().default(0).notNull(),
	fecha: date(),
	fechaPago: date("fecha_pago"),
	lugarPago: text("lugar_pago"),
	formaPago: formaPago("forma_pago"),
	banco: text(),
	cbu: text(),
	basico: numeric({ precision: 15, scale:  2 }),
	haberes: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	noRemunerativo: numeric("no_remunerativo", { precision: 15, scale:  2 }).default('0').notNull(),
	descuentos: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	retenciones: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	neto: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	obraSocialId: uuid("obra_social_id"),
	periodoCargas: date("periodo_cargas"),
	fechaDepositoCargas: date("fecha_deposito_cargas"),
	situacionRevista1Id: uuid("situacion_revista_1_id"),
	situacionRevista1DiaInicio: smallint("situacion_revista_1_dia_inicio"),
	situacionRevista2Id: uuid("situacion_revista_2_id"),
	situacionRevista2DiaInicio: smallint("situacion_revista_2_dia_inicio"),
	situacionRevista3Id: uuid("situacion_revista_3_id"),
	situacionRevista3DiaInicio: smallint("situacion_revista_3_dia_inicio"),
	diasTrabajados: integer("dias_trabajados"),
	horasTrabajadas: integer("horas_trabajadas"),
	importeADetraerLey27430: numeric("importe_a_detraer_ley27430", { precision: 15, scale:  2 }),
	importeMaternidadArt13: numeric("importe_maternidad_art13", { precision: 15, scale:  2 }),
	contribucionTareaDiferencial: numeric("contribucion_tarea_diferencial", { precision: 15, scale:  2 }),
	contribucionAdicionalOs: numeric("contribucion_adicional_os", { precision: 15, scale:  2 }),
	remuneracion4Y8Override: numeric("remuneracion_4y8_override", { precision: 15, scale:  2 }),
	remuneracion9Override: numeric("remuneracion_9_override", { precision: 15, scale:  2 }),
	observacionRecibo: text("observacion_recibo"),
	observacionInterna: text("observacion_interna"),
	confirmado: boolean().default(false).notNull(),
	calculadoAt: timestamp("calculado_at", { withTimezone: true }),
	fuente: datoFuente().default('calculo').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_recibo_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_recibo_cliente_periodo").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops"), table.periodo.asc().nullsLast().op("date_ops")),
	index("idx_recibo_empleado").using("btree", table.empleadoId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "recibo_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "recibo_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.empleadoId],
			foreignColumns: [empleado.id],
			name: "recibo_empleado_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.obraSocialId],
			foreignColumns: [obraSocial.id],
			name: "recibo_obra_social_id_fkey"
		}),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "recibo_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.situacionRevista1Id],
			foreignColumns: [situacionRevista.id],
			name: "recibo_situacion_revista_1_id_fkey"
		}),
	foreignKey({
			columns: [table.situacionRevista2Id],
			foreignColumns: [situacionRevista.id],
			name: "recibo_situacion_revista_2_id_fkey"
		}),
	foreignKey({
			columns: [table.situacionRevista3Id],
			foreignColumns: [situacionRevista.id],
			name: "recibo_situacion_revista_3_id_fkey"
		}),
	unique("recibo_empleado_id_periodo_tipo_quincena_fuente_key").on(table.empleadoId, table.periodo, table.tipo, table.quincena, table.fuente),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
	check("recibo_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
]);

export const tipoEmpresa = pgTable("tipo_empresa", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("tipo_empresa_codigo_key").on(table.codigo),
]);

export const deuda = pgTable("deuda", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	credencialId: uuid("credencial_id").notNull(),
	clienteId: uuid("cliente_id"),
	cuit: text().notNull(),
	impuesto: text().notNull(),
	concepto: text().notNull(),
	subConcepto: text("sub_concepto"),
	periodo: date(),
	cuota: numeric({ precision: 5, scale:  0 }),
	venceAt: date("vence_at"),
	establecimiento: text(),
	saldo: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	interesResarcitorio: numeric("interes_resarcitorio", { precision: 15, scale:  2 }).default('0').notNull(),
	interesPunitorio: numeric("interes_punitorio", { precision: 15, scale:  2 }).default('0').notNull(),
	estado: deudaEstado().default('abierta').notNull(),
	intimada: boolean().default(false).notNull(),
	detectadaAt: timestamp("detectada_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_deuda_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_deuda_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	index("idx_deuda_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_deuda_obligacion").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops"), table.cuit.asc().nullsLast().op("numeric_ops"), table.establecimiento.asc().nullsLast().op("text_ops"), table.impuesto.asc().nullsLast().op("numeric_ops"), table.concepto.asc().nullsLast().op("numeric_ops"), table.subConcepto.asc().nullsLast().op("numeric_ops"), table.periodo.asc().nullsLast().op("numeric_ops"), table.cuota.asc().nullsLast().op("numeric_ops"), table.venceAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "deuda_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "deuda_credencial_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "deuda_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const proyeccionImpuesto = pgTable("proyeccion_impuesto", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clienteId: uuid("cliente_id").notNull(),
	periodo: date().notNull(),
	impuesto: impuesto().notNull(),
	montoProyectado: numeric("monto_proyectado", { precision: 15, scale:  2 }).notNull(),
	confianza: confianza(),
	factores: jsonb(),
	generadaAt: timestamp("generada_at", { withTimezone: true }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_proyeccion_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "proyeccion_impuesto_cliente_id_fkey"
		}).onDelete("cascade"),
	unique("proyeccion_impuesto_cliente_id_periodo_impuesto_key").on(table.clienteId, table.periodo, table.impuesto),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = proyeccion_impuesto.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = proyeccion_impuesto.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const credencialAfip = pgTable("credencial_afip", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	cuit: text().notNull(),
	clave: text().notNull(),
	nombre: text(),
	email: text(),
	telefono: text(),
	estado: credencialEstado().default('activa').notNull(),
	ultimoLoginOk: timestamp("ultimo_login_ok", { withTimezone: true }),
	verificadaAt: timestamp("verificada_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_credencial_afip_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "credencial_afip_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("scrapper_bootstrap", { as: "permissive", for: "select", to: ["arca_scrapper"] }),
]);

export const escalaSalarial = pgTable("escala_salarial", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	categoriaId: uuid("categoria_id").notNull(),
	vigenciaDesde: date("vigencia_desde").notNull(),
	vigenciaHasta: date("vigencia_hasta"),
	montoBasico: numeric("monto_basico", { precision: 15, scale:  2 }).notNull(),
	montoNoRemunerativo: numeric("monto_no_remunerativo", { precision: 15, scale:  2 }).default('0').notNull(),
	periodoLabel: text("periodo_label"),
	fuente: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_escala_categoria").using("btree", table.categoriaId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.categoriaId],
			foreignColumns: [convenioCategoria.id],
			name: "escala_salarial_categoria_id_fkey"
		}).onDelete("cascade"),
	unique("escala_salarial_categoria_id_vigencia_desde_key").on(table.categoriaId, table.vigenciaDesde),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM (convenio_categoria cc
     JOIN convenio cv ON ((cv.id = cc.convenio_id)))
  WHERE ((cc.id = escala_salarial.categoria_id) AND (cv.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM (convenio_categoria cc
     JOIN convenio cv ON ((cv.id = cc.convenio_id)))
  WHERE ((cc.id = escala_salarial.categoria_id) AND (cv.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const vencimiento = pgTable("vencimiento", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	credencialId: uuid("credencial_id").notNull(),
	clienteId: uuid("cliente_id"),
	cuit: text().notNull(),
	impuesto: text().notNull(),
	concepto: text().notNull(),
	subConcepto: text("sub_concepto"),
	periodo: date(),
	cuota: numeric({ precision: 5, scale:  0 }),
	venceAt: date("vence_at").notNull(),
	detalle: text(),
	completadoAt: timestamp("completado_at", { withTimezone: true }),
	completadoPor: text("completado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_vencimiento_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_vencimiento_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	index("idx_vencimiento_vence").using("btree", table.venceAt.asc().nullsLast().op("date_ops")),
	uniqueIndex("uq_vencimiento_obligacion").using("btree", table.credencialId.asc().nullsLast().op("numeric_ops"), table.cuit.asc().nullsLast().op("numeric_ops"), table.impuesto.asc().nullsLast().op("numeric_ops"), table.concepto.asc().nullsLast().op("numeric_ops"), table.subConcepto.asc().nullsLast().op("date_ops"), table.periodo.asc().nullsLast().op("uuid_ops"), table.cuota.asc().nullsLast().op("uuid_ops"), table.venceAt.asc().nullsLast().op("numeric_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "vencimiento_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.completadoPor],
			foreignColumns: [user.id],
			name: "vencimiento_completado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "vencimiento_credencial_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "vencimiento_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const empleado = pgTable("empleado", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	cuil: text().notNull(),
	legajo: text().notNull(),
	nombre: text().notNull(),
	sexo: sexo(),
	fechaNacimiento: date("fecha_nacimiento"),
	nacionalidadId: uuid("nacionalidad_id"),
	domicilio: text(),
	localidadId: uuid("localidad_id"),
	provinciaId: uuid("provincia_id"),
	codigoPostal: text("codigo_postal"),
	fechaAlta: date("fecha_alta").notNull(),
	fechaBaja: date("fecha_baja"),
	activo: boolean().default(true).notNull(),
	convenioId: uuid("convenio_id"),
	categoriaId: uuid("categoria_id"),
	categoriaTexto: text("categoria_texto"),
	tarea: text(),
	tipoJornada: tipoJornada("tipo_jornada").default('full_time').notNull(),
	horasMensualesNormales: integer("horas_mensuales_normales").default(0).notNull(),
	diasMensualesNormales: integer("dias_mensuales_normales").default(0).notNull(),
	valorHora: numeric("valor_hora", { precision: 15, scale:  2 }),
	valorSueldo: numeric("valor_sueldo", { precision: 15, scale:  2 }),
	obraSocialId: uuid("obra_social_id"),
	conyuge: integer().default(0).notNull(),
	hijos: integer().default(0).notNull(),
	formaPago: formaPago("forma_pago"),
	banco: text(),
	cbu: text(),
	situacionId: uuid("situacion_id").notNull(),
	condicionId: uuid("condicion_id").notNull(),
	actividadId: uuid("actividad_id").notNull(),
	modalidadContratacionId: uuid("modalidad_contratacion_id"),
	siniestradoId: uuid("siniestrado_id").notNull(),
	zonaId: uuid("zona_id"),
	observaciones: text(),
	fuente: datoFuente().default('import').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_empleado_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_empleado_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_empleado_cuil").using("btree", table.cuil.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.actividadId],
			foreignColumns: [actividad.id],
			name: "empleado_actividad_id_fkey"
		}),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "empleado_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.categoriaId],
			foreignColumns: [convenioCategoria.id],
			name: "empleado_categoria_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "empleado_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.condicionId],
			foreignColumns: [condicionTrabajador.id],
			name: "empleado_condicion_id_fkey"
		}),
	foreignKey({
			columns: [table.convenioId],
			foreignColumns: [convenio.id],
			name: "empleado_convenio_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.localidadId],
			foreignColumns: [localidad.id],
			name: "empleado_localidad_id_fkey"
		}),
	foreignKey({
			columns: [table.modalidadContratacionId],
			foreignColumns: [modalidadContratacion.id],
			name: "empleado_modalidad_contratacion_id_fkey"
		}),
	foreignKey({
			columns: [table.nacionalidadId],
			foreignColumns: [nacionalidad.id],
			name: "empleado_nacionalidad_id_fkey"
		}),
	foreignKey({
			columns: [table.obraSocialId],
			foreignColumns: [obraSocial.id],
			name: "empleado_obra_social_id_fkey"
		}),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "empleado_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.provinciaId],
			foreignColumns: [provincia.id],
			name: "empleado_provincia_id_fkey"
		}),
	foreignKey({
			columns: [table.siniestradoId],
			foreignColumns: [siniestrado.id],
			name: "empleado_siniestrado_id_fkey"
		}),
	foreignKey({
			columns: [table.situacionId],
			foreignColumns: [situacionRevista.id],
			name: "empleado_situacion_id_fkey"
		}),
	foreignKey({
			columns: [table.zonaId],
			foreignColumns: [zona.id],
			name: "empleado_zona_id_fkey"
		}),
	unique("empleado_cliente_id_cuil_key").on(table.clienteId, table.cuil),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
	check("empleado_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
]);

export const provincia = pgTable("provincia", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("provincia_codigo_key").on(table.codigo),
]);

export const ivaDeclaracion = pgTable("iva_declaracion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clienteId: uuid("cliente_id").notNull(),
	periodo: date().notNull(),
	presentadaAt: date("presentada_at"),
	debitoFiscal: numeric("debito_fiscal", { precision: 15, scale:  2 }),
	creditoFiscal: numeric("credito_fiscal", { precision: 15, scale:  2 }),
	saldoMesAnterior: numeric("saldo_mes_anterior", { precision: 15, scale:  2 }),
	saldoAfipMes: numeric("saldo_afip_mes", { precision: 15, scale:  2 }),
	saldoTecnicoFavor: numeric("saldo_tecnico_favor", { precision: 15, scale:  2 }),
	saldoTecnicoFavorMensual: numeric("saldo_tecnico_favor_mensual", { precision: 15, scale:  2 }),
	saldoLibreDisponibilidadAnteriorNeto: numeric("saldo_libre_disponibilidad_anterior_neto", { precision: 15, scale:  2 }),
	retencionesPercepcionesPeriodo: numeric("retenciones_percepciones_periodo", { precision: 15, scale:  2 }),
	saldoLibreDisponibilidadFavor: numeric("saldo_libre_disponibilidad_favor", { precision: 15, scale:  2 }),
	fuente: datoFuente().default('scraper').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_iva_declaracion_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "iva_declaracion_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "iva_declaracion_cliente_id_fkey"
		}).onDelete("cascade"),
	unique("iva_declaracion_cliente_id_periodo_key").on(table.clienteId, table.periodo),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = iva_declaracion.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = iva_declaracion.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
	check("iva_declaracion_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
]);

export const notificacion = pgTable("notificacion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	credencialId: uuid("credencial_id").notNull(),
	clienteId: uuid("cliente_id"),
	externalId: text("external_id"),
	mensaje: text().notNull(),
	publicadaAt: timestamp("publicada_at", { withTimezone: true }),
	venceAt: timestamp("vence_at", { withTimezone: true }),
	leida: boolean().default(false).notNull(),
	severidad: notificacionSeveridad().default('sin_clasificar').notNull(),
	categoria: text(),
	aiResumen: text("ai_resumen"),
	aiClasificadaAt: timestamp("ai_clasificada_at", { withTimezone: true }),
	asignadaA: text("asignada_a"),
	resueltaAt: timestamp("resuelta_at", { withTimezone: true }),
	resueltaPor: text("resuelta_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_notificacion_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_notificacion_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	index("idx_notificacion_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.asignadaA],
			foreignColumns: [user.id],
			name: "notificacion_asignada_a_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "notificacion_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "notificacion_credencial_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "notificacion_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.resueltaPor],
			foreignColumns: [user.id],
			name: "notificacion_resuelta_por_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const documento = pgTable("documento", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	credencialId: uuid("credencial_id").notNull(),
	clienteId: uuid("cliente_id"),
	nombre: text().notNull(),
	storageKey: text("storage_key"),
	mimeType: text("mime_type").notNull(),
	tamanoBytes: integer("tamano_bytes").notNull(),
	checksum: text(),
	fuente: datoFuente().default('scraper').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_documento_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_documento_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_documento_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	index("idx_documento_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_documento_storage_key").using("btree", table.storageKey.asc().nullsLast().op("text_ops")).where(sql`(storage_key IS NOT NULL)`),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "documento_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "documento_cliente_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "documento_credencial_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "documento_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
	check("documento_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
]);

export const agentRun = pgTable("agent_run", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	conversationId: uuid("conversation_id"),
	clienteId: uuid("cliente_id"),
	userId: text("user_id"),
	tipo: agentRunTipo().notNull(),
	modelo: text(),
	costo: numeric({ precision: 12, scale:  6 }),
	resultado: agentRunResultado(),
	input: jsonb(),
	output: jsonb(),
	toolTrace: jsonb("tool_trace"),
	error: text(),
	startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_run_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_run_conversation").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_run_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "agent_run_cliente_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [agentConversation.id],
			name: "agent_run_conversation_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "agent_run_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "agent_run_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const accesoUsuarioCliente = pgTable("acceso_usuario_cliente", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	rol: accesoRol().default('cliente_lector').notNull(),
	puedeSubirDocumentos: boolean("puede_subir_documentos").default(true).notNull(),
	puedeVerDeudas: boolean("puede_ver_deudas").default(true).notNull(),
	puedeVerIva: boolean("puede_ver_iva").default(true).notNull(),
	puedeVerSueldos: boolean("puede_ver_sueldos").default(false).notNull(),
	puedeChatearIa: boolean("puede_chatear_ia").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_acceso_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_acceso_usuario").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "acceso_usuario_cliente_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "acceso_usuario_cliente_user_id_fkey"
		}).onDelete("cascade"),
	unique("acceso_usuario_cliente_user_id_cliente_id_key").on(table.userId, table.clienteId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = acceso_usuario_cliente.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = acceso_usuario_cliente.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
	pgPolicy("portal_bootstrap", { as: "permissive", for: "all", to: ["arca_app"] }),
]);

export const agentMessage = pgTable("agent_message", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	role: agentMessageRole().notNull(),
	contenido: text().notNull(),
	toolCalls: jsonb("tool_calls"),
	citas: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_message_conversation").using("btree", table.conversationId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [agentConversation.id],
			name: "agent_message_conversation_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM agent_conversation p
  WHERE ((p.id = agent_message.conversation_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM agent_conversation p
  WHERE ((p.id = agent_message.conversation_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const baseCalculo = pgTable("base_calculo", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	descripcion: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("base_calculo_codigo_key").on(table.codigo),
]);

export const anexoCmv = pgTable("anexo_cmv", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	ejercicioId: uuid("ejercicio_id").notNull(),
	existenciaInicial: numeric("existencia_inicial", { precision: 15, scale:  2 }).default('0').notNull(),
	comprasGastos: numeric("compras_gastos", { precision: 15, scale:  2 }).default('0').notNull(),
	existenciaFinal: numeric("existencia_final", { precision: 15, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "anexo_cmv_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ejercicioId],
			foreignColumns: [ejercicio.id],
			name: "anexo_cmv_ejercicio_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "anexo_cmv_org_id_fkey"
		}).onDelete("cascade"),
	unique("anexo_cmv_cliente_id_ejercicio_id_key").on(table.clienteId, table.ejercicioId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const asientoLinea = pgTable("asiento_linea", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	asientoId: uuid("asiento_id").notNull(),
	cuentaId: uuid("cuenta_id").notNull(),
	debe: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	haber: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	descripcion: text(),
	orden: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_asiento_linea_asiento").using("btree", table.asientoId.asc().nullsLast().op("uuid_ops")),
	index("idx_asiento_linea_cuenta").using("btree", table.cuentaId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.asientoId],
			foreignColumns: [asiento.id],
			name: "asiento_linea_asiento_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cuentaId],
			foreignColumns: [cuenta.id],
			name: "asiento_linea_cuenta_id_fkey"
		}).onDelete("restrict"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM asiento p
  WHERE ((p.id = asiento_linea.asiento_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM asiento p
  WHERE ((p.id = asiento_linea.asiento_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	check("asiento_linea_un_lado", sql`((debe = (0)::numeric) AND (haber > (0)::numeric)) OR ((debe > (0)::numeric) AND (haber = (0)::numeric))`),
]);

export const asiento = pgTable("asiento", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	ejercicioId: uuid("ejercicio_id").notNull(),
	periodoId: uuid("periodo_id").notNull(),
	numero: integer().notNull(),
	fecha: date().notNull(),
	descripcion: text(),
	origenTipo: asientoOrigenTipo("origen_tipo").default('manual').notNull(),
	origenId: uuid("origen_id"),
	reglaId: uuid("regla_id"),
	anulado: boolean().default(false).notNull(),
	anuladoAt: timestamp("anulado_at", { withTimezone: true }),
	anuladoPor: text("anulado_por"),
	motivoAnulacion: text("motivo_anulacion"),
	editadoPostGeneracion: boolean("editado_post_generacion").default(false).notNull(),
	fuente: datoFuente().default('manual').notNull(),
	creadoPor: text("creado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_asiento_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_asiento_cliente_fecha").using("btree", table.clienteId.asc().nullsLast().op("date_ops"), table.fecha.asc().nullsLast().op("date_ops")),
	index("idx_asiento_origen").using("btree", table.origenTipo.asc().nullsLast().op("enum_ops"), table.origenId.asc().nullsLast().op("enum_ops")),
	index("idx_asiento_periodo").using("btree", table.periodoId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "asiento_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.anuladoPor],
			foreignColumns: [user.id],
			name: "asiento_anulado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "asiento_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.creadoPor],
			foreignColumns: [user.id],
			name: "asiento_creado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ejercicioId],
			foreignColumns: [ejercicio.id],
			name: "asiento_ejercicio_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "asiento_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.periodoId],
			foreignColumns: [periodoContable.id],
			name: "asiento_periodo_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.reglaId],
			foreignColumns: [reglaMapeo.id],
			name: "asiento_regla_id_fkey"
		}).onDelete("set null"),
	unique("asiento_cliente_id_ejercicio_id_numero_key").on(table.clienteId, table.ejercicioId, table.numero),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	check("asiento_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
	check("asiento_origen_coherente", sql`((origen_tipo = 'manual'::asiento_origen_tipo) AND (origen_id IS NULL)) OR ((origen_tipo <> 'manual'::asiento_origen_tipo) AND (origen_id IS NOT NULL))`),
]);

export const asientoTemplate = pgTable("asiento_template", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	nombre: text().notNull(),
	lineas: jsonb().default([]).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_asiento_template_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "asiento_template_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "asiento_template_cliente_id_fkey"
		}).onDelete("cascade"),
	unique("asiento_template_cliente_id_nombre_key").on(table.clienteId, table.nombre),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const alerta = pgTable("alerta", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	credencialId: uuid("credencial_id"),
	clienteId: uuid("cliente_id"),
	tipo: alertaTipo().notNull(),
	severidad: alertaSeveridad().notNull(),
	titulo: text().notNull(),
	descripcion: text(),
	origenTipo: alertaOrigen("origen_tipo"),
	origenId: uuid("origen_id"),
	estado: alertaEstado().default('abierta').notNull(),
	asignadaA: text("asignada_a"),
	resueltaAt: timestamp("resuelta_at", { withTimezone: true }),
	resueltaPor: text("resuelta_por"),
	detalle: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_alerta_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_alerta_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	index("idx_alerta_estado").using("btree", table.estado.asc().nullsLast().op("enum_ops")).where(sql`(estado = 'abierta'::alerta_estado)`),
	index("idx_alerta_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("idx_alerta_origen").using("btree", table.origenTipo.asc().nullsLast().op("enum_ops"), table.origenId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.asignadaA],
			foreignColumns: [user.id],
			name: "alerta_asignada_a_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "alerta_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "alerta_credencial_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "alerta_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.origenId],
			foreignColumns: [job.id],
			name: "alerta_origen_job_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.resueltaPor],
			foreignColumns: [user.id],
			name: "alerta_resuelta_por_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	check("alerta_resuelta_coherente", sql`(estado = 'resuelta'::alerta_estado) OR ((estado <> 'resuelta'::alerta_estado) AND (resuelta_at IS NULL))`),
]);

export const conceptoAfip = pgTable("concepto_afip", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	codigoHasta: text("codigo_hasta"),
	tipo: conceptoTipo().notNull(),
	descripcion: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("concepto_afip_codigo_key").on(table.codigo),
	check("concepto_afip_check", sql`(codigo_hasta IS NULL) OR (codigo_hasta > codigo)`),
	check("concepto_afip_codigo_check", sql`codigo ~ '^[0-9]{6}$'::text`),
	check("concepto_afip_codigo_hasta_check", sql`codigo_hasta ~ '^[0-9]{6}$'::text`),
	check("concepto_afip_tipo_check", sql`tipo <> 'retencion'::concepto_tipo`),
]);

export const agentAction = pgTable("agent_action", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	agentRunId: uuid("agent_run_id").notNull(),
	clienteId: uuid("cliente_id"),
	tipo: text().notNull(),
	payload: jsonb().notNull(),
	estado: agentActionEstado().default('propuesta').notNull(),
	decididoPor: text("decidido_por"),
	decididoAt: timestamp("decidido_at", { withTimezone: true }),
	ejecutadoAt: timestamp("ejecutado_at", { withTimezone: true }),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_action_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_agent_action_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("idx_agent_action_pendientes").using("btree", table.estado.asc().nullsLast().op("enum_ops")).where(sql`(estado = 'propuesta'::agent_action_estado)`),
	index("idx_agent_action_run").using("btree", table.agentRunId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.agentRunId],
			foreignColumns: [agentRun.id],
			name: "agent_action_agent_run_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "agent_action_cliente_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.decididoPor],
			foreignColumns: [user.id],
			name: "agent_action_decidido_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "agent_action_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	check("agent_action_decision_coherente", sql`((estado = 'propuesta'::agent_action_estado) AND (decidido_at IS NULL)) OR ((estado <> 'propuesta'::agent_action_estado) AND (decidido_at IS NOT NULL))`),
	check("agent_action_ejecucion_coherente", sql`(estado = 'ejecutada'::agent_action_estado) = (ejecutado_at IS NOT NULL)`),
]);

export const clienteCct = pgTable("cliente_cct", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	cctCodigo: text("cct_codigo").notNull(),
	actividad: text(),
	signatarios: text(),
	fechaNovedad: text("fecha_novedad"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_cliente_cct_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cliente_cct_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "cliente_cct_org_id_fkey"
		}).onDelete("cascade"),
	unique("cliente_cct_cliente_id_cct_codigo_key").on(table.clienteId, table.cctCodigo),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const cct = pgTable("cct", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	signatarios: text(),
	descripcion: text(),
	activo: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("cct_codigo_key").on(table.codigo),
]);

export const clienteConcepto = pgTable("cliente_concepto", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	conceptoId: uuid("concepto_id").notNull(),
	habilitado: boolean().default(true).notNull(),
	codigoPropio: text("codigo_propio"),
	nombrePropio: text("nombre_propio"),
	conceptoAfipId: uuid("concepto_afip_id"),
	tipo: conceptoTipo(),
	modo: conceptoModoCalculo(),
	baseCalculoId: uuid("base_calculo_id"),
	importeFijo: numeric("importe_fijo", { precision: 15, scale:  2 }),
	orden: integer(),
	importeMin: numeric("importe_min", { precision: 15, scale:  2 }),
	importeMax: numeric("importe_max", { precision: 15, scale:  2 }),
	divCantidad: numeric("div_cantidad", { precision: 10, scale:  4 }),
	divHsNorm: boolean("div_hs_norm").default(false).notNull(),
	vigenciaDesde: date("vigencia_desde"),
	vigenciaHasta: date("vigencia_hasta"),
	repetible: boolean().default(false).notNull(),
	aportesSipa: boolean("aportes_sipa").default(false).notNull(),
	contribucionesSipa: boolean("contribuciones_sipa").default(false).notNull(),
	aportesInssjyp: boolean("aportes_inssjyp").default(false).notNull(),
	contribucionesInssjyp: boolean("contribuciones_inssjyp").default(false).notNull(),
	aportesObraSocial: boolean("aportes_obra_social").default(false).notNull(),
	contribucionesObraSocial: boolean("contribuciones_obra_social").default(false).notNull(),
	aportesFsr: boolean("aportes_fsr").default(false).notNull(),
	contribucionesFsr: boolean("contribuciones_fsr").default(false).notNull(),
	aportesRenatea: boolean("aportes_renatea").default(false).notNull(),
	contribucionesRenatea: boolean("contribuciones_renatea").default(false).notNull(),
	contribucionesAaff: boolean("contribuciones_aaff").default(false).notNull(),
	contribucionesFne: boolean("contribuciones_fne").default(false).notNull(),
	contribucionesLrt: boolean("contribuciones_lrt").default(false).notNull(),
	aportesDiferenciales: boolean("aportes_diferenciales").default(false).notNull(),
	aportesEspeciales: boolean("aportes_especiales").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_cliente_concepto_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_cliente_concepto_concepto").using("btree", table.conceptoId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.baseCalculoId],
			foreignColumns: [baseCalculo.id],
			name: "cliente_concepto_base_calculo_id_fkey"
		}),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cliente_concepto_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conceptoAfipId],
			foreignColumns: [conceptoAfip.id],
			name: "cliente_concepto_concepto_afip_id_fkey"
		}),
	foreignKey({
			columns: [table.conceptoId],
			foreignColumns: [concepto.id],
			name: "cliente_concepto_concepto_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "cliente_concepto_org_id_fkey"
		}).onDelete("cascade"),
	unique("cliente_concepto_cliente_id_concepto_id_key").on(table.clienteId, table.conceptoId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const cctFuente = pgTable("cct_fuente", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cctCodigo: text("cct_codigo").notNull(),
	url: text().notNull(),
	extractor: text().notNull(),
	activo: boolean().default(true).notNull(),
	ultimoOkAt: timestamp("ultimo_ok_at", { withTimezone: true }),
	ultimoError: text("ultimo_error"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	ultimoIntentoAt: timestamp("ultimo_intento_at", { withTimezone: true }),
}, (table) => [
	foreignKey({
			columns: [table.cctCodigo],
			foreignColumns: [cct.codigo],
			name: "cct_fuente_cct_codigo_fkey"
		}).onDelete("cascade"),
	unique("cct_fuente_cct_codigo_url_key").on(table.cctCodigo, table.url),
]);

export const condicionTrabajador = pgTable("condicion_trabajador", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("condicion_trabajador_codigo_key").on(table.codigo),
]);

export const comprobante = pgTable("comprobante", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	direccion: comprobanteDireccion().notNull(),
	tipo: smallint().notNull(),
	puntoVenta: integer("punto_venta").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	numero: bigint({ mode: "number" }).notNull(),
	fechaEmision: date("fecha_emision").notNull(),
	periodo: date().generatedAlwaysAs(sql`(date_trunc('month'::text, (fecha_emision)::timestamp without time zone))::date`),
	contraparteId: uuid("contraparte_id").notNull(),
	moneda: char({ length: 3 }).default('ARS').notNull(),
	cotizacion: numeric({ precision: 15, scale:  4 }).default('1').notNull(),
	netoGravado: numeric("neto_gravado", { precision: 15, scale:  2 }).default('0').notNull(),
	netoNoGravado: numeric("neto_no_gravado", { precision: 15, scale:  2 }).default('0').notNull(),
	exento: numeric({ precision: 15, scale:  2 }).default('0').notNull(),
	otrosTributos: numeric("otros_tributos", { precision: 15, scale:  2 }).default('0').notNull(),
	ivaTotal: numeric("iva_total", { precision: 15, scale:  2 }).default('0').notNull(),
	total: numeric({ precision: 15, scale:  2 }).notNull(),
	cae: text(),
	fuente: datoFuente().default('scraper').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_comprobante_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_comprobante_cliente_periodo").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops"), table.periodo.asc().nullsLast().op("uuid_ops")),
	index("idx_comprobante_contraparte").using("btree", table.contraparteId.asc().nullsLast().op("uuid_ops")),
	index("idx_comprobante_fecha").using("btree", table.fechaEmision.asc().nullsLast().op("date_ops")),
	index("idx_comprobante_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "comprobante_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "comprobante_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.contraparteId],
			foreignColumns: [contraparte.id],
			name: "comprobante_contraparte_id_fkey"
		}),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "comprobante_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tipo],
			foreignColumns: [comprobanteTipo.codigo],
			name: "comprobante_tipo_fkey"
		}),
	unique("comprobante_cliente_id_direccion_contraparte_id_tipo_punto__key").on(table.clienteId, table.direccion, table.tipo, table.puntoVenta, table.numero, table.contraparteId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
	check("comprobante_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
]);

export const comprobanteAlicuota = pgTable("comprobante_alicuota", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	comprobanteId: uuid("comprobante_id").notNull(),
	alicuota: numeric({ precision: 5, scale:  2 }).notNull(),
	neto: numeric({ precision: 15, scale:  2 }).notNull(),
	iva: numeric({ precision: 15, scale:  2 }).notNull(),
}, (table) => [
	index("idx_comprobante_alicuota_comprobante").using("btree", table.comprobanteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.comprobanteId],
			foreignColumns: [comprobante.id],
			name: "comprobante_alicuota_comprobante_id_fkey"
		}).onDelete("cascade"),
	unique("comprobante_alicuota_comprobante_id_alicuota_key").on(table.comprobanteId, table.alicuota),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM comprobante p
  WHERE ((p.id = comprobante_alicuota.comprobante_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM comprobante p
  WHERE ((p.id = comprobante_alicuota.comprobante_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const convenio = pgTable("convenio", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	cctCodigo: text("cct_codigo"),
	nombre: text().notNull(),
	descripcion: text(),
	activo: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_convenio_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cctCodigo],
			foreignColumns: [cct.codigo],
			name: "convenio_cct_codigo_fkey"
		}),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "convenio_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "convenio_org_id_fkey"
		}).onDelete("cascade"),
	unique("convenio_cliente_id_nombre_key").on(table.clienteId, table.nombre),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const cliente = pgTable("cliente", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	cuit: text().notNull(),
	razonSocial: text("razon_social").notNull(),
	tipoPersona: tipoPersona("tipo_persona").notNull(),
	condicionIva: condicionIva("condicion_iva"),
	iibbRegimen: iibbRegimen("iibb_regimen"),
	estado: clienteEstado().default('activo').notNull(),
	bajaMotivo: text("baja_motivo"),
	bajaAt: timestamp("baja_at", { withTimezone: true }),
	email: text(),
	telefono: text(),
	domicilio: text(),
	notas: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	marcoContable: marcoContable("marco_contable").default('rt54').notNull(),
}, (table) => [
	index("idx_cliente_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "cliente_org_id_fkey"
		}).onDelete("cascade"),
	unique("cliente_org_id_cuit_key").on(table.orgId, table.cuit),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const clienteEeccConfig = pgTable("cliente_eecc_config", {
	clienteId: uuid("cliente_id").primaryKey().notNull(),
	actividadPrincipal: text("actividad_principal"),
	fechaConstitucion: date("fecha_constitucion"),
	fechaInscripcionRpc: date("fecha_inscripcion_rpc"),
	numeroIgj: text("numero_igj"),
	cierreEjercicioMes: smallint("cierre_ejercicio_mes"),
	firmanteId: uuid("firmante_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cliente_eecc_config_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.firmanteId],
			foreignColumns: [firmante.id],
			name: "cliente_eecc_config_firmante_fk"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_eecc_config.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_eecc_config.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const clienteCuenta = pgTable("cliente_cuenta", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clienteId: uuid("cliente_id").notNull(),
	cuentaId: uuid("cuenta_id").notNull(),
	activa: boolean(),
	nombrePropio: text("nombre_propio"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_cliente_cuenta_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cliente_cuenta_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cuentaId],
			foreignColumns: [cuenta.id],
			name: "cliente_cuenta_cuenta_id_fkey"
		}).onDelete("cascade"),
	unique("cliente_cuenta_cliente_id_cuenta_id_key").on(table.clienteId, table.cuentaId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_cuenta.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_cuenta.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const conciliacionComprobante = pgTable("conciliacion_comprobante", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	movimientoBancarioId: uuid("movimiento_bancario_id").notNull(),
	comprobanteId: uuid("comprobante_id").notNull(),
	importeConciliado: numeric("importe_conciliado", { precision: 15, scale:  2 }).notNull(),
	estado: conciliacionEstado().default('sugerida').notNull(),
	fuente: datoFuente().default('manual').notNull(),
	confianza: numeric({ precision: 5, scale:  4 }),
	revisadoPor: text("revisado_por"),
	revisadoAt: timestamp("revisado_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_conciliacion_comprobante").using("btree", table.comprobanteId.asc().nullsLast().op("uuid_ops")),
	index("idx_conciliacion_comprobante_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_conciliacion_movimiento").using("btree", table.movimientoBancarioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "conciliacion_comprobante_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.comprobanteId],
			foreignColumns: [comprobante.id],
			name: "conciliacion_comprobante_comprobante_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.movimientoBancarioId],
			foreignColumns: [movimientoBancario.id],
			name: "conciliacion_comprobante_movimiento_bancario_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.revisadoPor],
			foreignColumns: [user.id],
			name: "conciliacion_comprobante_revisado_por_fkey"
		}).onDelete("set null"),
	unique("conciliacion_comprobante_movimiento_bancario_id_comprobante_key").on(table.movimientoBancarioId, table.comprobanteId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM comprobante p
  WHERE ((p.id = conciliacion_comprobante.comprobante_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM comprobante p
  WHERE ((p.id = conciliacion_comprobante.comprobante_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	check("conciliacion_importe_positivo", sql`importe_conciliado > (0)::numeric`),
	check("conciliacion_comprobante_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
]);

export const clienteEmpleadorConfig = pgTable("cliente_empleador_config", {
	clienteId: uuid("cliente_id").primaryKey().notNull(),
	liquidaSueldos: boolean("liquida_sueldos").default(false).notNull(),
	tipoEmpresaId: uuid("tipo_empresa_id"),
	seguroColectivo: boolean("seguro_colectivo").default(false).notNull(),
	mipyme: boolean().default(false).notNull(),
	ordenCln: text("orden_cln"),
	situacionDefaultId: uuid("situacion_default_id"),
	condicionDefaultId: uuid("condicion_default_id"),
	actividadDefaultId: uuid("actividad_default_id"),
	modalidadDefaultId: uuid("modalidad_default_id"),
	siniestradoDefaultId: uuid("siniestrado_default_id"),
	zonaDefaultId: uuid("zona_default_id"),
	obraSocialDefaultId: uuid("obra_social_default_id"),
	firmaEmpleadorKey: text("firma_empleador_key"),
	plantillaEmpleadoId: uuid("plantilla_empleado_id"),
	usaLsdReferencia: boolean("usa_lsd_referencia").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cliente_empleador_config_cliente_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_empleador_config.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = cliente_empleador_config.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const concepto = pgTable("concepto", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	numero: smallint().notNull(),
	nombre: text().notNull(),
	codigoAfip: text("codigo_afip").notNull(),
	tipo: conceptoTipo().notNull(),
	modo: conceptoModoCalculo().notNull(),
	baseCalculoId: uuid("base_calculo_id"),
	pctFijo: numeric("pct_fijo", { precision: 7, scale:  4 }),
	divHsNorm: integer("div_hs_norm").default(1).notNull(),
	divCantidad: integer("div_cantidad").default(1).notNull(),
	usaMemo: boolean("usa_memo").default(false).notNull(),
	usaCantidad: boolean("usa_cantidad").default(false).notNull(),
	usaPct: boolean("usa_pct").default(false).notNull(),
	usaConceptoRef: boolean("usa_concepto_ref").default(false).notNull(),
	usaImporte: boolean("usa_importe").default(false).notNull(),
	usaImporteMin: boolean("usa_importe_min").default(false).notNull(),
	usaImporteMax: boolean("usa_importe_max").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.baseCalculoId],
			foreignColumns: [baseCalculo.id],
			name: "concepto_base_calculo_id_fkey"
		}),
	unique("concepto_numero_key").on(table.numero),
	check("concepto_check", sql`(modo = 'pct_sobre_base'::concepto_modo_calculo) = (base_calculo_id IS NOT NULL)`),
	check("concepto_codigo_afip_check", sql`codigo_afip ~ '^[0-9]{6}$'::text`),
]);

export const contraparte = pgTable("contraparte", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	docTipo: documentoTipo("doc_tipo").notNull(),
	docNro: text("doc_nro").notNull(),
	nombre: text(),
	provincia: text(),
	provinciaFuente: provinciaFuente("provincia_fuente"),
	provinciaActualizadaAt: timestamp("provincia_actualizada_at", { withTimezone: true }),
	direccion: text(),
	codPostal: text("cod_postal"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("contraparte_doc_tipo_doc_nro_key").on(table.docTipo, table.docNro),
]);

export const convenioCategoria = pgTable("convenio_categoria", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	convenioId: uuid("convenio_id").notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	orden: integer(),
	esValorHora: boolean("es_valor_hora").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_convenio_categoria_convenio").using("btree", table.convenioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.convenioId],
			foreignColumns: [convenio.id],
			name: "convenio_categoria_convenio_id_fkey"
		}).onDelete("cascade"),
	unique("convenio_categoria_convenio_id_codigo_key").on(table.convenioId, table.codigo),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM convenio p
  WHERE ((p.id = convenio_categoria.convenio_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM convenio p
  WHERE ((p.id = convenio_categoria.convenio_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const comprobanteTipo = pgTable("comprobante_tipo", {
	codigo: smallint().primaryKey().notNull(),
	descripcion: text().notNull(),
	letra: char({ length: 1 }),
	clase: comprobanteClase().notNull(),
	esNc: boolean("es_nc").notNull(),
	discriminaIva: boolean("discrimina_iva").notNull(),
});

export const parametroPeriodo = pgTable("parametro_periodo", {
	periodo: date().primaryKey().notNull(),
	topeMaximoImponible: numeric("tope_maximo_imponible", { precision: 15, scale:  2 }),
	salarioMinimo: numeric("salario_minimo", { precision: 15, scale:  2 }),
	fuente: text(),
	actualizadoPorCron: boolean("actualizado_por_cron").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nacionalidad = pgTable("nacionalidad", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("nacionalidad_codigo_key").on(table.codigo),
]);

export const liquidacionIibb = pgTable("liquidacion_iibb", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	periodo: date().notNull(),
	provincia: text().notNull(),
	alicuota: numeric({ precision: 7, scale:  6 }).notNull(),
	saldoAFavor: numeric("saldo_a_favor", { precision: 15, scale:  2 }).default('0').notNull(),
	percepcionesAgentes: numeric("percepciones_agentes", { precision: 15, scale:  2 }).default('0').notNull(),
	percepcionesAduaneras: numeric("percepciones_aduaneras", { precision: 15, scale:  2 }).default('0').notNull(),
	retencionesAgentes: numeric("retenciones_agentes", { precision: 15, scale:  2 }).default('0').notNull(),
	retencionesBancarias: numeric("retenciones_bancarias", { precision: 15, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_liquidacion_iibb_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "liquidacion_iibb_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "liquidacion_iibb_org_id_fkey"
		}).onDelete("cascade"),
	unique("liquidacion_iibb_cliente_id_periodo_provincia_key").on(table.clienteId, table.periodo, table.provincia),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const obraSocial = pgTable("obra_social", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	codigoSos: text("codigo_sos"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("obra_social_codigo_key").on(table.codigo),
]);

export const organizationModule = pgTable("organization_module", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	module: orgModule().notNull(),
	enabled: boolean().default(false).notNull(),
	enabledAt: timestamp("enabled_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "organization_module_org_id_fkey"
		}).onDelete("cascade"),
	unique("organization_module_org_id_module_key").on(table.orgId, table.module),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const localidad = pgTable("localidad", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	unique("localidad_codigo_key").on(table.codigo),
]);

export const lsdPresentacion = pgTable("lsd_presentacion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	periodo: date().notNull(),
	numero: smallint().default(1).notNull(),
	filename: text().notNull(),
	empleados: integer().notNull(),
	conceptos: integer().notNull(),
	contenido: text().notNull(),
	generadoAt: timestamp("generado_at", { withTimezone: true }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_lsd_presentacion_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "lsd_presentacion_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "lsd_presentacion_org_id_fkey"
		}).onDelete("cascade"),
	unique("lsd_presentacion_cliente_id_periodo_numero_key").on(table.clienteId, table.periodo, table.numero),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const reglaMapeo = pgTable("regla_mapeo", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	nombre: text().notNull(),
	modulo: reglaMapeoModulo().notNull(),
	tipo: reglaMapeoTipo().default('default').notNull(),
	condicion: jsonb(),
	prioridad: integer().default(100).notNull(),
	activa: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_regla_mapeo_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "regla_mapeo_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "regla_mapeo_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const reglaMapeoLinea = pgTable("regla_mapeo_linea", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reglaId: uuid("regla_id").notNull(),
	cuentaId: uuid("cuenta_id").notNull(),
	lado: asientoLineaLado().notNull(),
	base: reglaMapeoBase().notNull(),
	importeFijo: numeric("importe_fijo", { precision: 15, scale:  2 }),
	orden: integer().default(0).notNull(),
	descripcion: text(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_regla_mapeo_linea_regla").using("btree", table.reglaId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cuentaId],
			foreignColumns: [cuenta.id],
			name: "regla_mapeo_linea_cuenta_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.reglaId],
			foreignColumns: [reglaMapeo.id],
			name: "regla_mapeo_linea_regla_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM regla_mapeo p
  WHERE ((p.id = regla_mapeo_linea.regla_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM regla_mapeo p
  WHERE ((p.id = regla_mapeo_linea.regla_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const riesgoSnapshot = pgTable("riesgo_snapshot", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clienteId: uuid("cliente_id").notNull(),
	periodo: date().notNull(),
	score: numeric({ precision: 5, scale:  2 }).notNull(),
	nivel: riesgoNivel().notNull(),
	factores: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_riesgo_snapshot_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "riesgo_snapshot_cliente_id_fkey"
		}).onDelete("cascade"),
	unique("riesgo_snapshot_cliente_id_periodo_key").on(table.clienteId, table.periodo),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = riesgo_snapshot.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cliente c
  WHERE ((c.id = riesgo_snapshot.cliente_id) AND (c.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const reciboConcepto = pgTable("recibo_concepto", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reciboId: uuid("recibo_id").notNull(),
	conceptoId: uuid("concepto_id").notNull(),
	tipo: conceptoTipo(),
	monto: numeric({ precision: 15, scale:  2 }).notNull(),
	cantidad: numeric({ precision: 12, scale:  4 }),
	porcentaje: numeric({ precision: 9, scale:  4 }),
	importe: numeric({ precision: 15, scale:  2 }),
	importeMin: numeric("importe_min", { precision: 15, scale:  2 }),
	importeMax: numeric("importe_max", { precision: 15, scale:  2 }),
	conceptoRef: smallint("concepto_ref"),
	memo: text(),
	pctUsado: numeric("pct_usado", { precision: 9, scale:  4 }),
	baseUsada: numeric("base_usada", { precision: 15, scale:  2 }),
	activo: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_recibo_concepto_concepto").using("btree", table.conceptoId.asc().nullsLast().op("uuid_ops")),
	index("idx_recibo_concepto_recibo").using("btree", table.reciboId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.conceptoId],
			foreignColumns: [concepto.id],
			name: "recibo_concepto_concepto_id_fkey"
		}),
	foreignKey({
			columns: [table.reciboId],
			foreignColumns: [recibo.id],
			name: "recibo_concepto_recibo_id_fkey"
		}).onDelete("cascade"),
	unique("recibo_concepto_recibo_id_concepto_id_memo_key").on(table.reciboId, table.conceptoId, table.memo),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM recibo p
  WHERE ((p.id = recibo_concepto.recibo_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM recibo p
  WHERE ((p.id = recibo_concepto.recibo_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const solicitud = pgTable("solicitud", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	tipo: solicitudTipo().notNull(),
	titulo: text().notNull(),
	descripcion: text(),
	estado: solicitudEstado().default('abierta').notNull(),
	pedidaPor: text("pedida_por"),
	venceAt: timestamp("vence_at", { withTimezone: true }),
	completadaAt: timestamp("completada_at", { withTimezone: true }),
	detalle: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_solicitud_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_solicitud_estado").using("btree", table.estado.asc().nullsLast().op("enum_ops")).where(sql`(estado = 'abierta'::solicitud_estado)`),
	index("idx_solicitud_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "solicitud_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "solicitud_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.pedidaPor],
			foreignColumns: [user.id],
			name: "solicitud_pedida_por_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
	check("solicitud_completada_coherente", sql`(estado = 'completada'::solicitud_estado) = (completada_at IS NOT NULL)`),
]);

export const notificacionAdjunto = pgTable("notificacion_adjunto", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	notificacionId: uuid("notificacion_id").notNull(),
	documentoId: uuid("documento_id").notNull(),
	externalId: text("external_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_notificacion_adjunto_documento").using("btree", table.documentoId.asc().nullsLast().op("uuid_ops")),
	index("idx_notificacion_adjunto_notificacion").using("btree", table.notificacionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.documentoId],
			foreignColumns: [documento.id],
			name: "notificacion_adjunto_documento_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.notificacionId],
			foreignColumns: [notificacion.id],
			name: "notificacion_adjunto_notificacion_id_fkey"
		}).onDelete("cascade"),
	unique("notificacion_adjunto_notificacion_id_documento_id_key").on(table.notificacionId, table.documentoId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM documento p
  WHERE ((p.id = notificacion_adjunto.documento_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM documento p
  WHERE ((p.id = notificacion_adjunto.documento_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	pgPolicy("portal", { as: "permissive", for: "all", to: ["arca_portal"] }),
]);

export const jobLog = pgTable("job_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	level: jobLogLevel().notNull(),
	message: text().notNull(),
	context: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_job_log_job").using("btree", table.jobId.asc().nullsLast().op("uuid_ops")),
	index("idx_job_log_nivel").using("btree", table.level.asc().nullsLast().op("enum_ops")).where(sql`(level = ANY (ARRAY['warn'::job_log_level, 'error'::job_log_level]))`),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [job.id],
			name: "job_log_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(EXISTS ( SELECT 1
   FROM job p
  WHERE ((p.id = job_log.job_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM job p
  WHERE ((p.id = job_log.job_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const cuenta = pgTable("cuenta", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	codigo: text().notNull(),
	nombre: text().notNull(),
	tipo: cuentaTipo().notNull(),
	alcance: cuentaAlcance().default('base').notNull(),
	clienteId: uuid("cliente_id"),
	padreId: uuid("padre_id"),
	descripcion: text(),
	rubro: cuentaRubro(),
	saldoEsperado: cuentaSaldo("saldo_esperado"),
	funcionGasto: cuentaFuncionGasto("funcion_gasto"),
	naturalezaInflacion: cuentaNaturalezaInflacion("naturaleza_inflacion"),
	flujoEfectivo: cuentaFlujoEfectivo("flujo_efectivo"),
	esCuentaSistema: boolean("es_cuenta_sistema").default(false).notNull(),
	activa: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	cuentaAjusteId: uuid("cuenta_ajuste_id"),
}, (table) => [
	index("idx_cuenta_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_cuenta_cuenta_ajuste").using("btree", table.cuentaAjusteId.asc().nullsLast().op("uuid_ops")),
	index("idx_cuenta_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("idx_cuenta_padre").using("btree", table.padreId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cuentaAjusteId],
			foreignColumns: [table.id],
			name: "cuenta_cuenta_ajuste_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "cuenta_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "cuenta_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.padreId],
			foreignColumns: [table.id],
			name: "cuenta_padre_id_fkey"
		}).onDelete("restrict"),
	unique("cuenta_org_id_cliente_id_codigo_key").on(table.orgId, table.codigo, table.clienteId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	check("cuenta_alcance_coherente", sql`((alcance = 'base'::cuenta_alcance) AND (cliente_id IS NULL)) OR ((alcance = 'propia'::cuenta_alcance) AND (cliente_id IS NOT NULL))`),
]);

export const tareaComentario = pgTable("tarea_comentario", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tareaId: uuid("tarea_id").notNull(),
	autorId: text("autor_id").notNull(),
	contenido: text().notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
	index("ix_studio_task_comment_task").using("btree", table.tareaId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.tareaId],
			foreignColumns: [tarea.id],
			name: "studio_task_comment_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.autorId],
			foreignColumns: [user.id],
			name: "studio_task_comment_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM tarea t
  WHERE ((t.id = tarea_comentario.tarea_id) AND (t.org_id = current_setting('app.org_id'::text, true)))))` }),
]);

export const ejercicio = pgTable("ejercicio", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	numero: integer().notNull(),
	fechaDesde: date("fecha_desde").notNull(),
	fechaHasta: date("fecha_hasta").notNull(),
	estado: ejercicioEstado().default('abierto').notNull(),
	cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
	cerradoPor: text("cerrado_por"),
	reabiertoAt: timestamp("reabierto_at", { withTimezone: true }),
	reabiertoPor: text("reabierto_por"),
	motivoReapertura: text("motivo_reapertura"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	soloReferencia: boolean("solo_referencia").default(false).notNull(),
	estadosAjustados: boolean("estados_ajustados").default(true).notNull(),
}, (table) => [
	index("idx_ejercicio_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cerradoPor],
			foreignColumns: [user.id],
			name: "ejercicio_cerrado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "ejercicio_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "ejercicio_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reabiertoPor],
			foreignColumns: [user.id],
			name: "ejercicio_reabierto_por_fkey"
		}).onDelete("set null"),
	unique("ejercicio_cliente_id_numero_key").on(table.clienteId, table.numero),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const eecc = pgTable("eecc", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	ejercicioId: uuid("ejercicio_id").notNull(),
	estado: eeccEstado().default('borrador').notNull(),
	notas: jsonb().default([]).notNull(),
	aprobadoAt: timestamp("aprobado_at", { withTimezone: true }),
	aprobadoPor: text("aprobado_por"),
	pdfKey: text("pdf_key"),
	pdfBytes: integer("pdf_bytes"),
	pdfGeneradoAt: timestamp("pdf_generado_at", { withTimezone: true }),
	pdfGeneradoPor: text("pdf_generado_por"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	informeAuditor: jsonb("informe_auditor"),
	layout: jsonb().default([]).notNull(),
	etiquetasSeccion: jsonb("etiquetas_seccion").default({}).notNull(),
}, (table) => [
	index("idx_eecc_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.aprobadoPor],
			foreignColumns: [user.id],
			name: "eecc_aprobado_por_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "eecc_cliente_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ejercicioId],
			foreignColumns: [ejercicio.id],
			name: "eecc_ejercicio_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "eecc_org_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.pdfGeneradoPor],
			foreignColumns: [user.id],
			name: "eecc_pdf_generado_por_fkey"
		}).onDelete("set null"),
	unique("eecc_cliente_id_ejercicio_id_key").on(table.clienteId, table.ejercicioId),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const convenioFuente = pgTable("convenio_fuente", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	convenioId: uuid("convenio_id").notNull(),
	fuente: text().notNull(),
	detalle: text(),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_convenio_fuente_convenio").using("btree", table.convenioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.convenioId],
			foreignColumns: [convenio.id],
			name: "convenio_fuente_convenio_id_fkey"
		}).onDelete("cascade"),
	unique("convenio_fuente_convenio_id_fuente_key").on(table.convenioId, table.fuente),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM convenio p
  WHERE ((p.id = convenio_fuente.convenio_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM convenio p
  WHERE ((p.id = convenio_fuente.convenio_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
]);

export const firmante = pgTable("firmante", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	nombre: text().notNull(),
	titulo: text().default('Contador Público').notNull(),
	universidad: text(),
	consejo: text(),
	tomo: text(),
	folio: text(),
	firmaImagenKey: text("firma_imagen_key"),
	activo: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_firmante_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "firmante_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const movimientoBancario = pgTable("movimiento_bancario", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cuentaBancariaId: uuid("cuenta_bancaria_id").notNull(),
	fecha: date().notNull(),
	periodo: date().generatedAlwaysAs(sql`(date_trunc('month'::text, (fecha)::timestamp without time zone))::date`),
	direccion: movimientoDireccion().notNull(),
	importe: numeric({ precision: 15, scale:  2 }).notNull(),
	descripcion: text(),
	saldoPosterior: numeric("saldo_posterior", { precision: 15, scale:  2 }),
	contraparteId: uuid("contraparte_id"),
	contraparteTexto: text("contraparte_texto"),
	idExterno: text("id_externo"),
	datosCrudos: jsonb("datos_crudos"),
	fuente: datoFuente().default('import').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	aiRunId: uuid("ai_run_id"),
}, (table) => [
	index("idx_movimiento_bancario_ai_run").using("btree", table.aiRunId.asc().nullsLast().op("uuid_ops")).where(sql`(ai_run_id IS NOT NULL)`),
	index("idx_movimiento_bancario_contraparte").using("btree", table.contraparteId.asc().nullsLast().op("uuid_ops")),
	index("idx_movimiento_bancario_cuenta").using("btree", table.cuentaBancariaId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_movimiento_bancario_externo").using("btree", table.cuentaBancariaId.asc().nullsLast().op("text_ops"), table.idExterno.asc().nullsLast().op("text_ops")).where(sql`(id_externo IS NOT NULL)`),
	index("idx_movimiento_bancario_fecha").using("btree", table.fecha.asc().nullsLast().op("date_ops")),
	index("idx_movimiento_bancario_periodo").using("btree", table.periodo.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.aiRunId],
			foreignColumns: [agentRun.id],
			name: "movimiento_bancario_ai_run_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.contraparteId],
			foreignColumns: [contraparte.id],
			name: "movimiento_bancario_contraparte_id_fkey"
		}),
	foreignKey({
			columns: [table.cuentaBancariaId],
			foreignColumns: [cuentaBancaria.id],
			name: "movimiento_bancario_cuenta_bancaria_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM cuenta_bancaria p
  WHERE ((p.id = movimiento_bancario.cuenta_bancaria_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`, withCheck: sql`(EXISTS ( SELECT 1
   FROM cuenta_bancaria p
  WHERE ((p.id = movimiento_bancario.cuenta_bancaria_id) AND (p.org_id = current_setting('app.org_id'::text, true)))))`  }),
	check("movimiento_bancario_ai_coherente", sql`(fuente = 'ai'::dato_fuente) = (ai_run_id IS NOT NULL)`),
	check("movimiento_bancario_importe_positivo", sql`importe > (0)::numeric`),
]);

export const tareaColumna = pgTable("tarea_columna", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	nombre: text().notNull(),
	orden: integer().default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
	index("idx_studio_task_column_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "studio_task_column_organization_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))` }),
]);

export const tarea = pgTable("tarea", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	titulo: text().notNull(),
	descripcion: text(),
	tipo: tareaTipo().default('otro').notNull(),
	estado: tareaEstado().default('pendiente').notNull(),
	columnaId: uuid("columna_id"),
	asignadoA: text("asignado_a"),
	periodo: text("periodo"),
	venceAt: timestamp("vence_at"),
	fuente: text("fuente").default('manual').notNull(),
	estadoCambiadoAt: timestamp("estado_cambiado_at"),
	estadoCambiadoPor: text("estado_cambiado_por"),
	creadoPor: text("creado_por"),
	posicion: text("posicion"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
	index("ix_studio_task_estado").using("btree", table.orgId.asc().nullsLast().op("text_ops"), table.estado.asc().nullsLast().op("text_ops")),
	index("ix_studio_task_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("ix_studio_task_vencimiento").using("btree", table.venceAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "studio_task_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.columnaId],
			foreignColumns: [tareaColumna.id],
			name: "studio_task_columna_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.asignadoA],
			foreignColumns: [user.id],
			name: "studio_task_asignado_a_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.estadoCambiadoPor],
			foreignColumns: [user.id],
			name: "studio_task_estado_changed_by_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.creadoPor],
			foreignColumns: [user.id],
			name: "studio_task_created_by_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(org_id = current_setting('app.org_id'::text, true))` }),
]);

export const tareaCliente = pgTable("tarea_cliente", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tareaId: uuid("tarea_id").notNull(),
	clienteId: uuid("cliente_id").notNull(),
	completado: boolean().default(false).notNull(),
	completadoAt: timestamp("completado_at"),
	completadoPor: text("completado_por"),
	vencimientoId: uuid("vencimiento_id"),
}, (table) => [
	index("ix_studio_task_client_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_studio_task_client").using("btree", table.tareaId.asc().nullsLast().op("uuid_ops"), table.clienteId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("uq_tarea_cliente_vencimiento").using("btree", table.vencimientoId.asc().nullsLast().op("uuid_ops")).where(sql`(vencimiento_id IS NOT NULL)`),
	foreignKey({
			columns: [table.tareaId],
			foreignColumns: [tarea.id],
			name: "studio_task_client_task_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "studio_task_client_representative_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.completadoPor],
			foreignColumns: [user.id],
			name: "studio_task_client_completado_by_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.vencimientoId],
			foreignColumns: [vencimiento.id],
			name: "studio_task_client_vencimiento_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app"], using: sql`(EXISTS ( SELECT 1
   FROM tarea t
  WHERE ((t.id = tarea_cliente.tarea_id) AND (t.org_id = current_setting('app.org_id'::text, true)))))` }),
]);

export const evento = pgTable("evento", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	clienteId: uuid("cliente_id"),
	entidad: text().notNull(),
	entidadId: uuid("entidad_id"),
	tipo: eventoTipo().notNull(),
	actorTipo: actorTipo("actor_tipo").notNull(),
	actorId: text("actor_id"),
	detalle: jsonb(),
	at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_evento_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_evento_entidad").using("btree", table.entidad.asc().nullsLast().op("uuid_ops"), table.entidadId.asc().nullsLast().op("text_ops")),
	index("idx_evento_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "evento_cliente_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "evento_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
]);

export const job = pgTable("job", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	credencialId: uuid("credencial_id"),
	clienteId: uuid("cliente_id"),
	type: jobType().notNull(),
	status: jobStatus().default('pending').notNull(),
	params: jsonb().default({}).notNull(),
	result: jsonb(),
	failedReason: text("failed_reason"),
	attempts: integer().default(0).notNull(),
	progress: integer().default(0).notNull(),
	bullJobId: text("bull_job_id"),
	startedAt: timestamp("started_at", { withTimezone: true }),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	failedAt: timestamp("failed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("idx_job_cliente").using("btree", table.clienteId.asc().nullsLast().op("uuid_ops")),
	index("idx_job_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_job_credencial").using("btree", table.credencialId.asc().nullsLast().op("uuid_ops")),
	index("idx_job_org").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("idx_job_status").using("btree", table.status.asc().nullsLast().op("enum_ops")).where(sql`(status = ANY (ARRAY['pending'::job_status, 'running'::job_status]))`),
	foreignKey({
			columns: [table.clienteId],
			foreignColumns: [cliente.id],
			name: "job_cliente_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.credencialId],
			foreignColumns: [credencialAfip.id],
			name: "job_credencial_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [organization.id],
			name: "job_org_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant", { as: "permissive", for: "all", to: ["arca_agent", "arca_app", "arca_scrapper"], using: sql`(org_id = current_setting('app.org_id'::text, true))`, withCheck: sql`(org_id = current_setting('app.org_id'::text, true))`  }),
	check("job_credencial_requerida", sql`(type = ANY (ARRAY['escalas'::job_type, 'tope_imponible'::job_type])) OR (credencial_id IS NOT NULL)`),
]);

export const baseCalculoConcepto = pgTable("base_calculo_concepto", {
	baseCalculoId: uuid("base_calculo_id").notNull(),
	conceptoId: uuid("concepto_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.baseCalculoId],
			foreignColumns: [baseCalculo.id],
			name: "base_calculo_concepto_base_calculo_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conceptoId],
			foreignColumns: [concepto.id],
			name: "base_calculo_concepto_concepto_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.baseCalculoId, table.conceptoId], name: "base_calculo_concepto_pkey"}),
]);

