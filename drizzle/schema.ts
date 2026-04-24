import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  integer,
  pgEnum,
  foreignKey,
} from "drizzle-orm/pg-core";
import { user, organization } from "./auth";

export { user, organization };

// Job enums
export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "failed",
  "finished",
]);
export const jobTypeEnum = pgEnum("job_type", [
  "iva",
  "comprobantes",
  "comprobantes_full",
  "notificaciones",
  "deuda",
  "vencimientos",
]);

export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  identityNumber: text("identity_number").notNull().default(""),
  identityType: text("identity_type").notNull().default("cuit"),
  password: text("password").notNull().default(""),
  image: text("image").default(""),
  status: text("status").notNull().default("active"),
  convenioMultilateral: boolean("convenio_multilateral").notNull().default(false),
  regimenLocal: boolean("regimen_local").notNull().default(false),
  fiscalCondition: text("fiscal_condition"),
  liquidaSueldos: boolean("liquida_sueldos").notNull().default(false),
  cuitEmpresa: text("cuit_empresa").notNull().default(""),
  hasErrors: boolean("has_errors").default(false).notNull(),
  errorMessage: text("error_message").default(""),
  registeredAt: timestamp("registered_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index('idx_client_org').on(table.organizationId),
]);

export const profile = pgTable("profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  identityNumber: text("identity_number").notNull(),
  identityType: text("identity_type").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull(),
  liquidaSueldos: boolean("liquida_sueldos").notNull().default(false),
  scrapedAt: timestamp("scraped_at"),
  /** Firma digital del empleador (data URL base64) para impresión de recibos. */
  firmaDigitalEmpleador: text("firma_digital_empleador"),
  /** Indica si este perfil es administrado por el estudio. */
  managedByStudy: boolean("managed_by_study").notNull().default(true),
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
  profileType: text("profile_type").notNull().default("unknown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Convenios colectivos de trabajo (CCT) obtenidos desde AFIP -
 * "Simplificación Registral - Empleadores".
 * Se persiste por `profile_id` y `cct`.
 */
export const afipEmpleadoresConvenio = pgTable(
  "afip_empleadores_convenio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    cct: text("cct").notNull(),
    actividad: text("actividad").notNull(),
    signatarios: text("signatarios").notNull(),
    fechaNovedad: text("fecha_novedad").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("afip_empleadores_convenio_profile_id_cct_unique").on(
      table.profileId,
      table.cct
    ),
  ]
);

/**
 * Conceptos AFIP para el servicio "Simplificación Registral - Empleadores".
 * Se mapean por `profile_id` y `concepto_afip_id`.
 */
export const lsdConceptoAfip = pgTable(
  "lsd_concepto_afip",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    codigoAfip: text("codigo_afip").notNull(),
    descripcion: text("descripcion").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("lsd_concepto_afip_codigo_afip_unique").on(table.codigoAfip)]
);

export const lsdPerfilConcepto = pgTable(
  "lsd_perfil_concepto",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    conceptoAfipId: uuid("concepto_afip_id")
      .notNull()
      .references(() => lsdConceptoAfip.id, { onDelete: "cascade" }),
    codigoContribuyente: text("codigo_contribuyente").notNull(),
    descripcionContribuyente: text("descripcion_contribuyente").notNull(),
    marcaRepetible: boolean("marca_repetible").default(false).notNull(),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("lsd_perfil_concepto_profile_id_codigo_contribuyente_unique").on(
      table.profileId,
      table.codigoContribuyente
    ),
  ]
);

export const conceptoSos = pgTable(
  "concepto_sos",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    codigoAfip: text("codigo_afip").notNull(),
    conceptoAfipId: uuid("concepto_afip_id").references(() => lsdConceptoAfip.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("concepto_sos_codigo_unique").on(table.codigo)]
);

export const conceptoSosProfile = pgTable(
  "concepto_sos_profile",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    conceptoId: uuid("concepto_id")
      .notNull()
      .references(() => conceptoSos.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("concepto_sos_profile_concepto_profile_unique").on(table.conceptoId, table.profileId),
  ]
);

export const credential = pgTable("credential", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  storageProvider: text("storage_provider").notNull().default("external"),
  storageKey: text("storage_key"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  checksum: text("checksum"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoiceAttachment = pgTable("invoice_attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  notification: uuid("notification_id").references(() => notification.id),
  document: uuid("document_id").references(() => document.id),
  externalId: text("external_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  profile: uuid("profile_id").references(() => profile.id, {
    onDelete: "cascade",
  }),
  message: text("message").notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  publicationDate: timestamp("publication_date").notNull(),
  opened: boolean("opened").default(false).notNull(),
  severity: text("severity").default("unclassified").notNull(),
  category: text("category"),
  aiSummary: text("ai_summary"),
  aiClassifiedAt: timestamp("ai_classified_at"),
  assignedToUserId: text("assigned_to_user_id").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index('idx_notification_client_opened').on(table.client, table.opened),
  index('idx_notification_severity').on(table.client, table.severity),
]);

export const invoice = pgTable("invoice", {
  id: uuid("id").primaryKey().defaultRandom(),
  direction: text("direction").notNull(),
  emitionDate: timestamp("emition_date").notNull(),
  type: text("type").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientIdentityNumber: text("recipient_identity_number").notNull(),
  recipientIdentityType: text("recipient_identity_type").notNull(),
  emitterName: text("emitter_name").notNull(),
  emitterIdentityNumber: text("emitter_identity_number").notNull(),
  emitterIdentityType: text("emitter_identity_type").notNull(),
  currency: text("currency").notNull(),
  cureencyRate: numeric("currency_rate").notNull(),
  salePoint: text("sale_point").notNull(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  receiptProvince: text("receipt_province"),

  profile: uuid("profile_id").references(() => profile.id, {
    onDelete: "cascade",
  }),
  authorizationNumber: text("authorization_number").notNull(),
  idFrom: numeric("id_from").notNull(),
  idTo: numeric("id_to").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  amountIVA0: numeric("amount_iva_0").notNull(),
  IVA25: numeric("iva_25").notNull(),
  amountIVA25: numeric("amount_iva_25").notNull(),
  IVA5: numeric("iva_5").notNull(),
  amountIVA5: numeric("amount_iva_5").notNull(),
  IVA105: numeric("iva_105").notNull(),
  amountIVA105: numeric("amount_iva_105").notNull(),
  IVA21: numeric("iva_21").notNull(),
  amountIVA21: numeric("amount_iva_21").notNull(),
  IVA27: numeric("iva_27").notNull(),
  amountIVA27: numeric("amount_iva_27").notNull(),
  amountTaxed: numeric("amount_taxed").notNull(),
  amountNoTaxed: numeric("imp_neto_no_gravado").notNull(),
  amountExempt: numeric("amount_exempt").notNull(),
  other_taxes: numeric("other_taxes").notNull(),
  totalIVA: numeric("total_iva").notNull(),
  amount: numeric("amount").notNull(),

}, (table) => [
  foreignKey({
    columns: [table.client],
    foreignColumns: [client.id],
    name: "invoice_client_id_client_id_fk"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.profile],
    foreignColumns: [profile.id],
    name: "invoice_profile_id_profile_id_fk"
  }).onDelete("cascade"),
  unique("invoice_client_auth_type_unique").on(table.client, table.authorizationNumber, table.type),
  index('idx_invoice_client').on(table.client),
  index('idx_invoice_client_date').on(table.client, table.emitionDate),
]);

export const dueDate = pgTable("due_date", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  tax: text("tax").notNull().default(""),
  concept: text("concept").notNull().default(""),
  subConcept: text("sub_concept").notNull().default(""),
  period: text("period").notNull().default(""),
  quotaNumber: numeric("quota_number").notNull().default("0"),
  dueDate: timestamp("due_date").notNull().default(new Date()),
  detail: text("detail").notNull().default(""),
  completedAt: timestamp("completed_at"),
  completedByUserId: text("completed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index('idx_duedate_client_date').on(table.client, table.dueDate),
]);

export const debt = pgTable("debt", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  establishment: text("establishment").notNull().default(""),
  tax: text("tax").notNull().default(""),
  concept: text("concept").notNull().default(""),
  subConcept: text("sub_concept").notNull().default(""),
  period: text("period").notNull().default(""),
  quotaNumber: numeric("quota_number").notNull().default("0"),
  dueDate: timestamp("due_date").notNull().default(new Date()),
  balance: numeric("balance").notNull().default("0"),
  compensatoryInterest: numeric("compensatory_interest").notNull().default("0"),
  punitiveInterest: numeric("punitive_interest").notNull().default("0"),
  status: text("status").notNull().default("open"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  sourcePeriod: text("source_period"),
  isIntimated: boolean("is_intimated").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index('idx_debt_client_date').on(table.client, table.dueDate),
]);


export const movements = pgTable("movements", {
  id: text("id").primaryKey(),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  tipo: text("tipo").notNull(),
  // "ingreso" | "egreso"

  fecha: timestamp("fecha", { mode: "date" }).notNull(),

  descripcion: text("descripcion").notNull(),

  monto: numeric("monto", { precision: 12, scale: 2 }).notNull(),

  tipoGasto: text("tipo_gasto")
    .default("Sin especificar"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Resultado del scrape mensual de IVA (AFIP). Un registro por perfil por período.
 * El scrape se ejecuta una vez al mes, no cada vez que se abre la pestaña IVA.
 */
export const ivaScrape = pgTable(
  "iva_scrape",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    periodoFiscal: text("periodo_fiscal").notNull(), // ej. "12/2025"
    fechaPresentacion: text("fecha_presentacion"), // ej. "15/01/2026"
    ok: boolean("ok").notNull(),
    // Determinación del impuesto (panel 1)
    debitoFiscal: numeric("debito_fiscal", { precision: 18, scale: 2 }),
    creditoFiscal: numeric("credito_fiscal", { precision: 18, scale: 2 }),
    saldoMesPasado: numeric("saldo_mes_pasado", { precision: 18, scale: 2 }), // Saldo técnico a favor del contribuyente del período anterior
    saldoArcaMes: numeric("saldo_arca_mes", { precision: 18, scale: 2 }), // Valor bruto cuando el label es ARCA
    saldoTecnicoFavorContribuyente: numeric("saldo_tecnico_favor_contribuyente", { precision: 18, scale: 2 }), // 0 cuando en AFIP dice "Saldo a favor de ARCA"
    // Determinación de la posición mensual (panel 2)
    saldoTecnicoFavorContribuyentePosicionMensual: numeric("saldo_tecnico_favor_contribuyente_posicion_mensual", { precision: 18, scale: 2 }),
    saldoLibreDisponibilidadPeriodoAnteriorNeto: numeric("saldo_libre_disponibilidad_periodo_anterior_neto", { precision: 18, scale: 2 }),
    totalRetencionesPercepcionesPeriodo: numeric("total_retenciones_percepciones_periodo", { precision: 18, scale: 2 }),
    saldoLibreDisponibilidadFavorContribuyentePeriodo: numeric("saldo_libre_disponibilidad_favor_contribuyente_periodo", { precision: 18, scale: 2 }),
    sourceConfidence: text("source_confidence").notNull().default("unknown"),
    importedManually: boolean("imported_manually").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Un solo registro por perfil por período (upsert mensual)
    unique("iva_scrape_profile_periodo_unique").on(table.profileId, table.periodoFiscal),
  ]
);

// Job table for tracking scraping tasks
export const job = pgTable("job", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: jobStatusEnum("status").notNull().default("pending"),
  type: jobTypeEnum("type").notNull(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  params: jsonb("params").default({}),
  result: jsonb("result"),
  failedReason: text("failed_reason"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  failedAt: timestamp("failed_at"),

  // BullMQ correlation
  bullJobId: text("bull_job_id"),
  attempts: integer("attempts").default(0),
  progress: integer("progress").default(0),
});

// Logs por job (historial de ejecución)
export const jobLog = pgTable("job_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => job.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Tabla maestra de entidades fiscales: CUIL/CUIT único con nombre y provincia.
 * Sirve como catálogo de identidades fiscales vistas en facturas.
 */
export const fiscalEntity = pgTable(
  "fiscal_entity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cuilCuit: text("cuil_cuit").notNull().unique(),
    name: text("name").notNull(),
    province: text("province").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  }
);

// ========== MÓDULO SUELDOS / LIQUIDACIÓN ==========

/** Catálogo nacional de obras sociales (códigos legacy / AFIP). */
export const obraSocial = pgTable("obra_social", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payrollConvenioTipoJornadaEnum = pgEnum("payroll_tipo_jornada", [
  "full_time",
  "part_time",
  "reducida",
]);

/** Convenios colectivos de trabajo (por cliente) */
export const payrollConvenio = pgTable("payroll_convenio", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  cctCodigo: text("cct_codigo"),
  descripcion: text("descripcion"),
  activo: boolean("activo").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Categorías dentro de un convenio */
export const payrollConvenioCategoria = pgTable("payroll_convenio_categoria", {
  id: uuid("id").primaryKey().defaultRandom(),
  convenioId: uuid("convenio_id")
    .notNull()
    .references(() => payrollConvenio.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  orden: integer("orden").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Escalas salariales por categoría con vigencia (histórico) */
export const payrollEscala = pgTable("payroll_escala", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoriaId: uuid("categoria_id")
    .notNull()
    .references(() => payrollConvenioCategoria.id, { onDelete: "cascade" }),
  vigenciaDesde: timestamp("vigencia_desde", { mode: "date" }).notNull(),
  vigenciaHasta: timestamp("vigencia_hasta", { mode: "date" }),
  montoBasico: numeric("monto_basico", { precision: 12, scale: 2 }).notNull(),
  montoNoRemunerativo: numeric("monto_no_remunerativo", {
    precision: 12,
    scale: 2,
  })
    .default("0")
    .notNull(),
  periodoLabel: text("periodo_label"),
  fuente: text("fuente"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Tipo de concepto: remunerativo, no remunerativo, descuento, retención */
export const payrollConceptoTipoEnum = pgEnum("payroll_concepto_tipo", [
  "remunerativo",
  "no_remunerativo",
  "descuento",
  "retencion",
]);

/** Base de cálculo para fórmulas */
export const payrollConceptoBaseEnum = pgEnum("payroll_concepto_base", [
  "basico",
  "bruto",
  "total_remunerativo",
  "total_no_remunerativo",
  "total_descuentos",
  "neto",
  "fijo",
  "custom",
]);

/** Catálogo global de conceptos SOS con metadata de fórmula (base, divisores). */
export const conceptosCompletosSos = pgTable("conceptos_completos_sos", {
  id: uuid("id").primaryKey().defaultRandom(),
  numeroSos: integer("numero_sos").notNull().unique(),
  codigoAfip: text("codigo_afip"),
  nombre: text("nombre").notNull(),
  tieneMemo: boolean("tiene_memo").default(false),
  tieneCantidad: boolean("tiene_cantidad").default(false),
  tienePct: boolean("tiene_pct").default(false),
  tieneImpConceptoNro: boolean("tiene_imp_concepto_nro").default(false),
  tieneImporte: boolean("tiene_importe").default(false),
  tieneImpMin: boolean("tiene_imp_min").default(false),
  tieneImpMax: boolean("tiene_imp_max").default(false),
  /** Base de cálculo SOS (ej. 'sueldo', 'sub1_9', 'importe_fijo'). */
  baseColumna: text("base_columna"),
  /** Divisor de horas normales (1 = no divide, >1 = divide por N horas). */
  divHsNorm: integer("div_hs_norm").default(1),
  /** Divisor de días (1, 25 o 30). */
  divCantidad: integer("div_cantidad").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

/** Columna base de fórmula al estilo SOS (el usuario elige una sola) */
export const payrollBaseColumnaEnum = pgEnum("payroll_base_columna", [
  "valHora",
  "sueldoLegajo",
  "sueldo",
  "sub1_9",
  "sub1_19",
  "sub1_26",
  "sub1_39",
  "sub1_199",
  "sub411_469",
  "sub1_199_plus_411_469",
  "importe_fijo",
  "ref_concepto",
]);

/** Tipo de empleador para LSD */
export const payrollTipoEmpleadorEnum = pgEnum("payroll_tipo_empleador", [
  "dec814_inc_a",
  "dec814_inc_b",
  "dec814_inc_c",
]);

/** Situación de revista del empleado en el período */
export const payrollSituacionRevistaEnum = pgEnum("payroll_situacion_revista", [
  "activo",
  "licencia_enfermedad",
  "licencia_maternidad",
  "licencia_sin_goce",
  "suspendido_con_goce",
  "suspendido_sin_goce",
  "vacaciones",
  "accidente_trabajo",
  "baja_despido",
  "baja_fallecimiento",
  "baja_otras",
  "ilt_primeros_10",
  "ilt_once_o_mas",
  "reserva_puesto",
  "excedencia",
  "otro",
]);

/** Conceptos salariales configurables (fórmula, %, monto fijo, base) — por cliente */
export const payrollConcepto = pgTable("payroll_concepto", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  tipo: payrollConceptoTipoEnum("tipo").notNull(),
  baseCalculo: payrollConceptoBaseEnum("base_calculo").notNull().default("basico"),
  /** Fórmula: porcentaje (ej. "0.01 * basico") o monto fijo. Variables: basico, antiguedad, bruto, etc. */
  formula: text("formula").notNull(),
  /** Si es porcentaje (ej. 11) o monto fijo */
  esPorcentaje: boolean("es_porcentaje").default(true).notNull(),
  orden: integer("orden").default(0).notNull(),
  activo: boolean("activo").default(true).notNull(),
  vigenciaDesde: timestamp("vigencia_desde", { mode: "date" }),
  vigenciaHasta: timestamp("vigencia_hasta", { mode: "date" }),
  /** Número de concepto SOS (1-620). Permite mapear al catálogo estándar. */
  numeroSos: integer("numero_sos"),
  /** Código ARCA de 6 dígitos para el LSD (ej. "810000"). */
  codigoArca: text("codigo_arca"),
  /** Columna base al estilo SOS (alternativa más precisa que baseCalculo). */
  baseColumna: payrollBaseColumnaEnum("base_columna"),
  /** Divisor de cantidad (ej. 30 para sueldo diario, 25 para feriados). Default 1. */
  divCantidad: numeric("div_cantidad", { precision: 8, scale: 4 }).default("1"),
  /** Si divide además por las horas mensuales normales del empleado. */
  divHsNorm: boolean("div_hs_norm").default(false).notNull(),
  /** Importe mínimo (piso del resultado). */
  impMin: numeric("imp_min", { precision: 12, scale: 2 }),
  /** Importe máximo (techo del resultado). */
  impMax: numeric("imp_max", { precision: 12, scale: 2 }),
  /** Referencia a otro concepto cuyo resultado se usa como base. */
  refConceptoId: uuid("ref_concepto_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Empleados del perfil que liquida sueldos — fuente de verdad unificada (importados + manuales) */
export const liquidacionImportEmpleado = pgTable(
  "liquidacion_import_empleado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    cuil: text("cuil").notNull(),
    legajo: text("legajo").notNull(),
    nombre: text("nombre").notNull(),
    fechaAlta: timestamp("fecha_alta", { mode: "date" }),
    fechaBaja: timestamp("fecha_baja", { mode: "date" }),
    modoContrato: text("modo_contrato"),
    /** Categoría en texto libre (tal como viene del archivo importado). */
    categoria: text("categoria"),
    origen: text("origen").notNull().default("import"),
    // --- Campos operativos (completados al dar de alta o al vincular al convenio) ---
    convenioId: uuid("convenio_id")
      .references(() => payrollConvenio.id, { onDelete: "restrict" }),
    categoriaId: uuid("categoria_id")
      .references(() => payrollConvenioCategoria.id, { onDelete: "restrict" }),
    tipoJornada: payrollConvenioTipoJornadaEnum("tipo_jornada").default("full_time"),
    tipoEmpleador: payrollTipoEmpleadorEnum("tipo_empleador"),
    /** Descripción del puesto. Para LSD debe ir sin tildes ni ñ. */
    tarea: text("tarea"),
    /** Horas mensuales normales. Base para cálculo de valor hora. */
    horasMensualesNormales: integer("horas_mensuales_normales"),
    /** Días mensuales normales. Base para proporcional. Default 30. */
    diasMensualesNormales: integer("dias_mensuales_normales").default(30),
    /** Override del valor hora (alternativa al básico del convenio). */
    valorHora: numeric("valor_hora", { precision: 12, scale: 2 }),
    /** Override del sueldo básico (alternativa al básico del convenio). */
    valorSueldo: numeric("valor_sueldo", { precision: 12, scale: 2 }),
    /** Porcentaje adicional de aporte de Seguridad Social (si aplica). */
    porcentajeAporteAdicionalSS: numeric("porcentaje_aporte_adicional_ss", { precision: 5, scale: 4 }),
    /** Datos de pago por defecto del legajo (recibo toma estos valores si la cabecera del período está vacía). */
    lugarPago: text("lugar_pago"),
    formaPago: text("forma_pago"),
    cbu: text("cbu"),
    banco: text("banco"),
    activo: boolean("activo").default(true).notNull(),
    // --- Datos demográficos y de legajo (fuente: planilla Excel SOS) ---
    nacionalidad: text("nacionalidad"),
    fechaNacimiento: timestamp("fecha_nacimiento", { mode: "date" }),
    conyuge: integer("conyuge"),
    hijos: integer("hijos"),
    adherentes: integer("adherentes"),
    sexo: text("sexo"),
    domicilio: text("domicilio"),
    localidad: text("localidad"),
    codigoPostal: text("codigo_postal"),
    provincia: text("provincia"),
    codigoModalidadContratacion: text("codigo_modalidad_contratacion"),
    situacion: text("situacion"),
    codigoSituacion: text("codigo_situacion"),
    zona: text("zona"),
    codigoZona: text("codigo_zona"),
    condicion: text("condicion"),
    codigoCondicion: text("codigo_condicion"),
    actividad: text("actividad"),
    codigoActividad: text("codigo_actividad"),
    siniestrado: text("siniestrado"),
    codigoSiniestrado: text("codigo_siniestrado"),
    observaciones: text("observaciones"),
    obraSocialId: uuid("obra_social_id").references(() => obraSocial.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("liquidacion_import_empleado_profile_id_cuil_unique").on(
      table.profileId,
      table.cuil,
    ),
  ],
);

/** Recibos por empleado y período — fuente de verdad unificada (importados + generados) */
export const liquidacionImportRecibo = pgTable(
  "liquidacion_import_recibo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empleadoId: uuid("empleado_id")
      .notNull()
      .references(() => liquidacionImportEmpleado.id, { onDelete: "cascade" }),
    periodo: text("periodo").notNull(), // "YYYY-MM"
    /** Tipo de recibo: sueldo, anticipo, SAC, vacaciones, despido, comisiones, etc. */
    tipo: text("tipo").notNull(),
    fecha: timestamp("fecha", { mode: "date" }),
    // --- Totales ---
    /** Básico del período. */
    basico: numeric("basico", { precision: 12, scale: 2 }),
    /** Total de haberes remunerativos. */
    haberes: numeric("haberes", { precision: 14, scale: 2 }).notNull(),
    noRemunerativo: numeric("no_remunerativo", { precision: 14, scale: 2 }).notNull(),
    descuentos: numeric("descuentos", { precision: 14, scale: 2 }).notNull(),
    retenciones: numeric("retenciones", { precision: 14, scale: 2 }).notNull(),
    neto: numeric("neto", { precision: 14, scale: 2 }).notNull(),
    // --- Campos del recibo generado ---
    /** 0 = mes completo, 1 = primera quincena, 2 = segunda quincena. */
    quincena: text("quincena"),
    obraSocialId: uuid("obra_social_id").references(() => obraSocial.id, { onDelete: "set null" }),
    fechaPago: timestamp("fecha_pago", { mode: "date" }),
    lugarPago: text("lugar_pago"),
    /** efectivo | cheque | acreditacion */
    formaPago: text("forma_pago"),
    cbu: text("cbu"),
    banco: text("banco"),
    /** Período de cargas depositado, ej. "2026 / 02". */
    periodoCargas: text("periodo_cargas"),
    fechaDepositoCargas: timestamp("fecha_deposito_cargas", { mode: "date" }),
    situacionRevista: payrollSituacionRevistaEnum("situacion_revista"),
    observacionInterna: text("observacion_interna"),
    observacionRecibo: text("observacion_recibo"),
    /** Override manual de Remuneración 4 y 8 (base OS) para LSD. */
    rem4y8Override: numeric("rem4y8_override", { precision: 14, scale: 2 }),
    /** Override manual de Remuneración 9 (base ART) para LSD. */
    rem9Override: numeric("rem9_override", { precision: 14, scale: 2 }),
    /** Porcentaje adicional de contribución SS para tareas diferenciales. */
    contribucionTareaDiferencial: numeric("contribucion_tarea_diferencial", { precision: 5, scale: 4 }),
    /** Importe a detraer según Ley 27430. */
    importeADetraerLey27430: numeric("importe_a_detraer_ley27430", { precision: 12, scale: 2 }),
    /** Contribución adicional OS para completar el mínimo. */
    contribucionAdicionalOS: numeric("contribucion_adicional_os", { precision: 12, scale: 2 }),
    /** true cuando el recibo fue confirmado y se muestra en la solapa Recibo. */
    reciboConfirmado: boolean("recibo_confirmado").default(false),
    calculadoAt: timestamp("calculado_at"),
    /** "import" para recibos históricos del LSD, "generado" para los creados en el sistema. */
    origen: text("origen").notNull().default("import"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("liquidacion_import_recibo_empleado_periodo_tipo_unique").on(
      table.empleadoId,
      table.periodo,
      table.tipo,
    ),
  ],
);

/** Valores por código de concepto en cada recibo — fuente de verdad unificada (importados + generados) */
export const liquidacionImportConceptoValor = pgTable(
  "liquidacion_import_concepto_valor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reciboId: uuid("recibo_id")
      .notNull()
      .references(() => liquidacionImportRecibo.id, { onDelete: "cascade" }),
    /** Código de concepto LSD (ej: "810000"). Presente en importados y generados. */
    codigo: text("codigo").notNull(),
    /** Importe resultante del concepto. */
    monto: numeric("monto", { precision: 14, scale: 2 }).notNull(),
    // --- Campos del archivo LSD importado ---
    /** Cantidad (días, horas, unidades) tal como viene en el LSD. */
    cantidad: numeric("cantidad", { precision: 10, scale: 2 }),
    /** Porcentaje tal como viene en el LSD. */
    porcentaje: numeric("porcentaje", { precision: 8, scale: 4 }),
    /** Importe del concepto número referenciado en el LSD. */
    importeConceptoNumero: numeric("importe_concepto_numero", { precision: 14, scale: 2 }),
    /** Importe base antes de aplicar mínimo/máximo. */
    importe: numeric("importe", { precision: 14, scale: 2 }),
    /** Importe mínimo tal como viene en el LSD. */
    importeMinimo: numeric("importe_minimo", { precision: 14, scale: 2 }),
    /** Importe máximo tal como viene en el LSD. */
    importeMaximo: numeric("importe_maximo", { precision: 14, scale: 2 }),
    // --- Campos para recibos generados en el sistema ---
    /** FK al concepto configurado. Null para registros importados del LSD. */
    conceptoId: uuid("concepto_id").references(() => payrollConcepto.id, { onDelete: "set null" }),
    /**
     * Tipo según el motor al persistir (remunerativo | no_remunerativo | descuento | retencion).
     * Permite columnas correctas en el recibo aunque falle el join al concepto de nómina.
     */
    tipoLiquidacion: text("tipo_liquidacion"),
    /** Override manual del resultado: si está seteado, saltea el cálculo del motor. */
    importeOverride: numeric("importe_override", { precision: 14, scale: 2 }),
    /** Si el concepto está activo (habilitado) en este recibo. */
    activoEnRecibo: boolean("activo_en_recibo").default(true),
    /** Nota personalizada para este concepto en este recibo. */
    memo: text("memo"),
    /** Porcentaje efectivamente usado en el cálculo (auditoría). */
    pctUsado: numeric("pct_usado", { precision: 8, scale: 4 }),
    /** Base efectivamente usada en el cálculo (auditoría). */
    baseUsada: numeric("base_usada", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("liquidacion_import_concepto_valor_recibo_id_codigo_unique").on(
      table.reciboId,
      table.codigo,
    ),
  ],
);

/**
 * Audit trail for every important data point, tracing its origin
 * (scraper job, manual entry, AI classification, import).
 * Source values: 'scraper', 'manual', 'ai', 'import'
 * Action values: 'created', 'updated', 'classified'
 */
export const dataSourceEvent = pgTable("data_source_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").references(() => profile.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  source: text("source").notNull(),
  sourceJobId: uuid("source_job_id").references(() => job.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentConversation = pgTable("agent_conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Nueva conversación"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const agentMessage = pgTable("agent_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => agentConversation.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  toolCalls: jsonb("tool_calls"),
  citations: jsonb("citations"),
  confidence: text("confidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentRun = pgTable("agent_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => agentConversation.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
  profileId: uuid("profile_id").references(() => profile.id, { onDelete: "set null" }),
  status: text("status").notNull().default("running"),
  intent: text("intent"),
  input: text("input").notNull(),
  output: text("output"),
  toolTrace: jsonb("tool_trace"),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

/**
 * Fiscal year end date configuration per client for balance alerts.
 */
export const clientBalanceConfig = pgTable("client_balance_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .unique()
    .references(() => client.id, { onDelete: "cascade" }),
  fiscalYearEndMonth: integer("fiscal_year_end_month").notNull(),
  fiscalYearEndDay: integer("fiscal_year_end_day").notNull(),
  presentationDueDays: integer("presentation_due_days"),
  /** Days before fiscal year end to send alerts. Stored as JSON array, e.g. [60, 30, 15, 7] */
  alertDaysBefore: jsonb("alert_days_before").default([60, 30, 15, 7]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Periodic risk snapshots per profile for tracking risk trends over time.
 * risk_level values: low, medium, high, critical
 */
export const profileRiskSnapshot = pgTable("profile_risk_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profile.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  riskLevel: text("risk_level").notNull(),
  factors: jsonb("factors"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("profile_risk_snapshot_profile_id_period_unique").on(table.profileId, table.period),
]);

/**
 * Centralized alert table for risks from different sources.
 * Types: overdue_debt, critical_notification, upcoming_due_date, scraper_error, balance_due_soon, missing_activity
 */
export const alert = pgTable("alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").references(() => profile.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  sourceEntityType: text("source_entity_type"),
  sourceEntityId: text("source_entity_id"),
  status: text("status").notNull().default("open"),
  assignedToUserId: text("assigned_to_user_id").references(() => user.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id").references(() => user.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_alert_org_status").on(table.organizationId, table.status),
]);