import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  integer,
  pgEnum,
  foreignKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  "batch",
]);

export const representative = pgTable("representative", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Nombre de la persona física. Puede ser null si aún no se scrapeó de AFIP. */
  name: text("name"),
  /** CUIT de la persona física (login AFIP) */
  cuit: text("cuit").notNull().default(""),
  /** Password encriptado de AFIP */
  afipPassword: text("afip_password").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  image: text("image").default(""),
  status: text("status").notNull().default("active"),
  convenioMultilateral: boolean("convenio_multilateral").notNull().default(false),
  regimenLocal: boolean("regimen_local").notNull().default(false),
  fiscalCondition: text("fiscal_condition"),
  liquidaSueldos: boolean("liquida_sueldos").notNull().default(false),
  registeredAt: timestamp("registered_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index('idx_representative_org').on(table.organizationId),
]);

export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id").references(() => representative.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  identityNumber: text("identity_number").notNull(),
  identityType: text("identity_type").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull(),
  /** Condición fiscal: 'responsable_inscripto' | 'monotributista' | 'exento' | null (sin clasificar). */
  fiscalCondition: text("fiscal_condition"),
  liquidaSueldos: boolean("liquida_sueldos").notNull().default(false),
  /**
   * Compatibilidad con flujo legado LSD:
   * cuando está activo, el sistema conserva importados como referencia y permite
   * generar recibos propios en paralelo (mismo período/tipo, distinto origen).
   */
  usaLsdReferencia: boolean("usa_lsd_referencia").notNull().default(false),
  scrapedAt: timestamp("scraped_at"),
  /** Firma digital del empleador (data URL base64) para impresión de recibos. */
  firmaDigitalEmpleador: text("firma_digital_empleador"),
  /**
   * Empleado de referencia para la plantilla base de recibos.
   * Cuando está seteado, los conceptos de su último recibo (códigos 1-699)
   * se precargan al generar un nuevo recibo (cantidad y porcentaje).
   */
  payrollPlantillaEmpleadoId: uuid("payroll_plantilla_empleado_id")
    .references((): AnyPgColumn => liquidacionImportEmpleado.id, { onDelete: "set null" }),
  /** Indica si este perfil es administrado por el estudio. */
  managedByStudy: boolean("managed_by_study").notNull().default(true),
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
  profileType: text("profile_type").notNull().default("unknown"),
  /** ID de contribuyente en AFIP FES (Mis Comprobantes). Se cachea del discovery. */
  afipContribuyenteId: integer("afip_contribuyente_id"),
  // --- Configuración de empleador para liquidación de sueldos ---
  /** Tipo de empresa (Dec. 814/01, etc.) — determina alícuota de contribuciones patronales. */
  tipoEmpresaId: uuid("tipo_empresa_id")
    .references((): AnyPgColumn => payrollTipoEmpresa.id, { onDelete: "set null" }),
  /** Seguro colectivo de vida obligatorio (Decreto 1567/74). */
  seguroColectivo: boolean("seguro_colectivo").notNull().default(false),
  /** Certificado MiPyME vigente (exención parcial de contribuciones). */
  mipyme: boolean("mipyme").notNull().default(false),
  /**
   * Orden CLN: cómo se imprimen/agrupan los recibos.
   * "C" = por CUIL, "L" = por legajo.
   */
  ordenCLN: text("orden_cln"),
  // --- Defaults de "Datos del Empleador" scrapeados de SOS Contador ---
  /** Situación de revista por defecto para nuevos empleados. */
  situacionDefaultId: uuid("situacion_default_id")
    .references((): AnyPgColumn => payrollSituacion.id, { onDelete: "set null" }),
  /** Condición del trabajador por defecto. */
  condicionDefaultId: uuid("condicion_default_id")
    .references((): AnyPgColumn => payrollCondicion.id, { onDelete: "set null" }),
  /** Actividad SIJP por defecto del empleador. */
  actividadDefaultId: uuid("actividad_default_id")
    .references((): AnyPgColumn => payrollActividad.id, { onDelete: "set null" }),
  /** Modalidad de contratación por defecto para nuevos empleados. */
  contratacionDefaultId: uuid("contratacion_default_id")
    .references((): AnyPgColumn => payrollModalidadContratacion.id, { onDelete: "set null" }),
  /** Tipo de siniestro por defecto. */
  siniestradoDefaultId: uuid("siniestrado_default_id")
    .references((): AnyPgColumn => payrollSiniestrado.id, { onDelete: "set null" }),
  /** Zona geográfica por defecto del empleador. */
  zonaDefaultId: uuid("zona_default_id")
    .references((): AnyPgColumn => payrollZona.id, { onDelete: "set null" }),
  /** Obra social por defecto del empleador. */
  obraSocialDefaultId: uuid("obra_social_default_id")
    .references((): AnyPgColumn => obraSocial.id, { onDelete: "set null" }),
  // --- Datos fiscales para el membrete de los Estados Contables (EECC) ---
  /** Actividad principal (ej. "Prestación de servicios de internación domiciliaria"). */
  actividadPrincipal: text("actividad_principal"),
  /** Fecha de inscripción en el Registro Público de Comercio. */
  fechaInscripcion: timestamp("fecha_inscripcion", { mode: "date" }),
  /** Número de inscripción en la Inspección General de Justicia (IGJ). */
  numeroInscripcion: text("numero_inscripcion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Convenios colectivos de trabajo (CCT) obtenidos desde AFIP -
 * "Simplificación Registral - Empleadores".
 * Se persiste por `client_id` y `cct`.
 */
export const afipEmpleadoresConvenio = pgTable(
  "afip_empleadores_convenio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    /** FK al catálogo global. Poblado automáticamente por trigger al insertar/actualizar. */
    convenioId: uuid("convenio_id")
      .references(() => conveniosDeTrabajo.id, { onDelete: "set null" }),
    cct: text("cct").notNull(),
    actividad: text("actividad").notNull(),
    signatarios: text("signatarios").notNull(),
    fechaNovedad: text("fecha_novedad").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("afip_empleadores_convenio_client_id_cct_unique").on(
      table.clientId,
      table.cct
    ),
  ]
);

/**
 * Catálogo global de convenios colectivos de trabajo conocidos.
 * Se popula automáticamente a medida que el scraper detecta nuevos CCT
 * en afip_empleadores_convenio. Un registro por número de CCT.
 */
export const conveniosDeTrabajo = pgTable("convenios_de_trabajo", {
  id: uuid("id").primaryKey().defaultRandom(),
  cct: text("cct").unique().notNull(),
  nombre: text("nombre").notNull(),
  signatarios: text("signatarios"),
  descripcion: text("descripcion"),
  activo: boolean("activo").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Conceptos AFIP para el servicio "Simplificación Registral - Empleadores".
 * Se mapean por `client_id` y `concepto_afip_id`.
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
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
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
    unique("lsd_perfil_concepto_client_id_codigo_contribuyente_unique").on(
      table.clientId,
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

export const conceptoSosClient = pgTable(
  "concepto_sos_client",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    conceptoId: uuid("concepto_id")
      .notNull()
      .references(() => conceptoSos.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("concepto_sos_client_concepto_client_unique").on(table.conceptoId, table.clientId),
  ]
);



export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id").references(() => representative.id, {
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
  representativeId: uuid("representative_id").references(() => representative.id, {
    onDelete: "cascade",
  }),
  clientId: uuid("client_id").references(() => client.id, {
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
  index('idx_notification_representative_opened').on(table.representativeId, table.opened),
  index('idx_notification_severity').on(table.representativeId, table.severity),
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
  representativeId: uuid("representative_id").references(() => representative.id, {
    onDelete: "cascade",
  }),
  receiptProvince: text("receipt_province"),

  clientId: uuid("client_id").references(() => client.id, {
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
    columns: [table.representativeId],
    foreignColumns: [representative.id],
    name: "invoice_representative_id_representative_id_fk"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.clientId],
    foreignColumns: [client.id],
    name: "invoice_client_id_client_id_fk"
  }).onDelete("cascade"),
  unique("invoice_representative_auth_type_unique").on(table.representativeId, table.authorizationNumber, table.type),
  index('idx_invoice_representative').on(table.representativeId),
  index('idx_invoice_representative_date').on(table.representativeId, table.emitionDate),
]);

export const dueDate = pgTable("due_date", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id").references(() => representative.id, {
    onDelete: "cascade",
  }),
  clientId: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  tax: text("tax").notNull().default(""),
  concept: text("concept").notNull().default(""),
  subConcept: text("sub_concept").notNull().default(""),
  period: text("period").notNull().default(""),
  quotaNumber: numeric("quota_number").notNull().default("0"),
  dueDate: timestamp("due_date").notNull().defaultNow(),
  detail: text("detail").notNull().default(""),
  completedAt: timestamp("completed_at"),
  completedByUserId: text("completed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index('idx_duedate_representative_date').on(table.representativeId, table.dueDate),
]);

export const debt = pgTable("debt", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id").notNull().references(() => representative.id, {
    onDelete: "cascade",
  }),
  clientId: uuid("client_id").references(() => client.id, {
    onDelete: "cascade",
  }),
  establishment: text("establishment").notNull().default(""),
  tax: text("tax").notNull().default(""),
  concept: text("concept").notNull().default(""),
  subConcept: text("sub_concept").notNull().default(""),
  period: text("period").notNull().default(""),
  quotaNumber: numeric("quota_number").notNull().default("0"),
  dueDate: timestamp("due_date").notNull().defaultNow(),
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
  index('idx_debt_representative_date').on(table.representativeId, table.dueDate),
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
 * Resultado del scrape mensual de IVA (AFIP). Un registro por client por período.
 * El scrape se ejecuta una vez al mes, no cada vez que se abre la pestaña IVA.
 */
export const ivaScrape = pgTable(
  "iva_scrape",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
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
    // Un solo registro por client por período (upsert mensual)
    unique("iva_scrape_client_periodo_unique").on(table.clientId, table.periodoFiscal),
  ]
);

/** Liquidación de IIBB por período y provincia — datos editables por el usuario */
export const iibbLiquidacion = pgTable(
  "iibb_liquidacion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    /** FK al representative (agrupador de empresa) */
    representativeId: uuid("representative_id")
      .notNull()
      .references(() => representative.id, { onDelete: "cascade" }),
    /** FK al profile (entidad fiscal con CUIT). Nullable: si null aplica a todos los profiles del representative. */
    profileId: uuid("profile_id").references(() => client.id, { onDelete: "cascade" }),
    /** Período en formato "YYYY-MM" (ej. "2026-07") */
    periodo: text("periodo").notNull(),
    /** Nombre/código de la provincia tal como viene de los comprobantes */
    provincia: text("provincia").notNull(),
    /** Alícuota IIBB (ej. 0.01 = 1%). Default 1% */
    alicuota: numeric("alicuota", { precision: 7, scale: 6 }).notNull().default("0.01"),
    /** Saldo a favor del período anterior (arrastrado o ingresado manualmente) */
    saldoAFavor: numeric("saldo_a_favor", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Percepciones de agentes de recaudación */
    percepcionesAgentes: numeric("percepciones_agentes", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Percepciones aduaneras */
    percepcionesAduaneras: numeric("percepciones_aduaneras", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Retenciones de agentes de retención */
    retencionesAgentes: numeric("retenciones_agentes", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Retenciones bancarias */
    retencionesBancarias: numeric("retenciones_bancarias", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("iibb_liquidacion_unique").on(
      table.orgId,
      table.representativeId,
      table.profileId,
      table.periodo,
      table.provincia
    ),
  ]
);

// Job table for tracking scraping tasks
export const job = pgTable("job", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: jobStatusEnum("status").notNull().default("pending"),
  type: jobTypeEnum("type").notNull(),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
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
    direccion: text("direccion"),
    codPostal: text("cod_postal"),
    // Fuente del dato de provincia/domicilio: 'padron' | 'nosis' | 'manual'
    provinceSource: text("province_source"),
    provinceFetchedAt: timestamp("province_fetched_at"),
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
  /** ID interno de SOS Contador (cbobrasocial.value). */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de situaciones de revista (códigos SOS/AFIP). */
export const payrollSituacion = pgTable("payroll_situacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  /** ID interno de SOS Contador (cbsituacion.value). */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de condiciones de trabajo (códigos SOS/AFIP). */
export const payrollCondicion = pgTable("payroll_condicion", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  /** ID interno de SOS Contador (cbcondicion.value). */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de actividades/rubros del empleador (códigos SOS/AFIP). */
export const payrollActividad = pgTable("payroll_actividad", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  /** ID interno de SOS Contador (cbactividad.value). */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de modalidades de contratación (códigos SOS/AFIP). */
export const payrollModalidadContratacion = pgTable("payroll_modalidad_contratacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  /** ID interno de SOS Contador (cbcontratacion.value). */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de tipos de siniestro ART (códigos SOS/AFIP). */
export const payrollSiniestrado = pgTable("payroll_siniestrado", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  /** ID interno de SOS Contador (cbsiniestrado.value). */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de provincias argentinas (códigos SOS). */
export const payrollProvincia = pgTable("payroll_provincia", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de nacionalidades / países (códigos SOS). */
export const payrollNacionalidad = pgTable("payroll_nacionalidad", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de zonas geográficas con reducción de cargas patronales (códigos SOS/AFIP históricos). */
export const payrollZona = pgTable("payroll_zona", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  /**
   * ID interno de SOS Contador para la opción canónica de esta zona (cbzona.value).
   * SOS tiene múltiples entradas históricas por zona (una por período); aquí
   * se guarda el ID de la más reciente/vigente para poder preseleccionarla.
   */
  codigoSos: text("codigo_sos").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Catálogo de localidades AFIP LSD (ddlLocalidad) — códigos de 2 caracteres (01-E3). */
export const payrollLocalidad = pgTable("payroll_localidad", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Catálogo de tipos de empresa (cbtipoempresa en SOS Contador).
 * Determina la alícuota de contribuciones patronales según Dec. 814/01 y normas afines.
 * Códigos SOS internos (codigoSos) para mapeo con importaciones.
 */
export const payrollTipoEmpresa = pgTable("payroll_tipo_empresa", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Código AFIP LSD para el Registro 01 (ej: "1", "4", "7B"). */
  codigoLsd: text("codigo_lsd").unique().notNull(),
  nombre: text("nombre").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payrollConvenioTipoJornadaEnum = pgEnum("payroll_tipo_jornada", [
  "full_time",
  "part_time",
  "reducida",
]);

/** Convenios colectivos de trabajo (por empresa/client bajo representative) */
export const payrollConvenio = pgTable("payroll_convenio", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
  /**
   * Empresa (client) a la que pertenece el convenio. NOT NULL en la DB.
   * El scoping de lectura es por `representativeId`; `clientId` asocia el
   * convenio a la empresa concreta para la que se creó.
   */
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

/** Fuentes de información que enriquecen cada convenio (AFIP, estudios, etc.). */
export const payrollConvenioFuente = pgTable(
  "payroll_convenio_fuente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    convenioId: uuid("convenio_id")
      .notNull()
      .references(() => payrollConvenio.id, { onDelete: "cascade" }),
    fuente: text("fuente").notNull(),
    detalle: text("detalle"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("payroll_convenio_fuente_convenio_id_fuente_unique").on(
      table.convenioId,
      table.fuente
    ),
  ]
);

/** Categorías dentro de un convenio */
export const payrollConvenioCategoria = pgTable("payroll_convenio_categoria", {
  id: uuid("id").primaryKey().defaultRandom(),
  convenioId: uuid("convenio_id")
    .notNull()
    .references(() => payrollConvenio.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  orden: integer("orden").default(0).notNull(),
  /** Si la categoría liquida por valor hora (jornaleros). Activa concepto 2 en lugar del 1. */
  esValorHora: boolean("es_valor_hora").default(false).notNull(),
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
  /** Porcentaje fijo del concepto (no editable por el usuario, ej. 8.33 para Presentismo). */
  pctFijo: numeric("pct_fijo"),
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

/** Conceptos salariales configurables (fórmula, %, monto fijo, base) — por representative */
export const payrollConcepto = pgTable("payroll_concepto", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
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

/** Empleados del client que liquida sueldos — fuente de verdad unificada (importados + manuales) */
export const liquidacionImportEmpleado = pgTable(
  "liquidacion_import_empleado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    cuil: text("cuil").notNull(),
    legajo: text("legajo").notNull(),
    nombre: text("nombre").notNull(),
    fechaAlta: timestamp("fecha_alta", { mode: "date" }),
    fechaIngreso: timestamp("fecha_ingreso", { mode: "date" }),
    fechaAntiguedadReconocida: timestamp("fecha_antiguedad_reconocida", { mode: "date" }),
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
    nacionalidadId: uuid("nacionalidad_id").references(() => payrollNacionalidad.id, { onDelete: "set null" }),
    fechaNacimiento: timestamp("fecha_nacimiento", { mode: "date" }),
    conyuge: integer("conyuge"),
    hijos: integer("hijos"),
    adherentes: integer("adherentes"),
    sexo: text("sexo"),
    domicilio: text("domicilio"),
    localidad: text("localidad"),
    codigoPostal: text("codigo_postal"),
    provinciaId: uuid("provincia_id").references(() => payrollProvincia.id, { onDelete: "set null" }),
    modalidadContratacionId: uuid("modalidad_contratacion_id").references(() => payrollModalidadContratacion.id, { onDelete: "set null" }),
    codigoModalidadContratacion: text("codigo_modalidad_contratacion"),
    situacionId: uuid("situacion_id").references(() => payrollSituacion.id, { onDelete: "set null" }),
    codigoSituacion: text("codigo_situacion"),
    zonaId: uuid("zona_id").references(() => payrollZona.id, { onDelete: "set null" }),
    codigoZona: text("codigo_zona"),
    localidadId: uuid("localidad_id").references(() => payrollLocalidad.id, { onDelete: "set null" }),
    condicionId: uuid("condicion_id").references(() => payrollCondicion.id, { onDelete: "set null" }),
    codigoCondicion: text("codigo_condicion"),
    actividadId: uuid("actividad_id").references(() => payrollActividad.id, { onDelete: "set null" }),
    codigoActividad: text("codigo_actividad"),
    siniestradoId: uuid("siniestrado_id").references(() => payrollSiniestrado.id, { onDelete: "set null" }),
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
    unique("liquidacion_import_empleado_client_id_cuil_unique").on(
      table.clientId,
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
    /** Situación de revista 1 (principal, obligatoria si se informa) */
    situacionRevista1Id: uuid("situacion_revista1_id").references(() => payrollSituacion.id, { onDelete: "set null" }),
    situacionRevista1DiaInicio: integer("situacion_revista1_dia_inicio"),
    /** Situación de revista 2 (cuando el empleado tuvo 2 situaciones en el mes) */
    situacionRevista2Id: uuid("situacion_revista2_id").references(() => payrollSituacion.id, { onDelete: "set null" }),
    situacionRevista2DiaInicio: integer("situacion_revista2_dia_inicio"),
    /** Situación de revista 3 (cuando el empleado tuvo 3 situaciones en el mes) */
    situacionRevista3Id: uuid("situacion_revista3_id").references(() => payrollSituacion.id, { onDelete: "set null" }),
    situacionRevista3DiaInicio: integer("situacion_revista3_dia_inicio"),
    /** Días efectivamente trabajados en el período */
    diasTrabajados: integer("dias_trabajados"),
    /** Horas trabajadas en el período */
    horasTrabajadas: integer("horas_trabajadas"),
    /** Importe maternidad Art. 13 Ley 27.674 */
    importeMaternidadArt13: numeric("importe_maternidad_art13", { precision: 12, scale: 2 }),
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
    unique("liquidacion_import_recibo_empleado_periodo_tipo_origen_unique").on(
      table.empleadoId,
      table.periodo,
      table.tipo,
      table.origen,
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
  representativeId: uuid("representative_id").references(() => representative.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "cascade" }),
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
  representativeId: uuid("representative_id").references(() => representative.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
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
 * Fiscal year end date configuration per representative for balance alerts.
 */
export const representativeBalanceConfig = pgTable("representative_balance_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id")
    .notNull()
    .unique()
    .references(() => representative.id, { onDelete: "cascade" }),
  fiscalYearEndMonth: integer("fiscal_year_end_month").notNull(),
  fiscalYearEndDay: integer("fiscal_year_end_day").notNull(),
  presentationDueDays: integer("presentation_due_days"),
  /** Days before fiscal year end to send alerts. Stored as JSON array, e.g. [60, 30, 15, 7] */
  alertDaysBefore: jsonb("alert_days_before").default([60, 30, 15, 7]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Periodic risk snapshots per client for tracking risk trends over time.
 * risk_level values: low, medium, high, critical
 */
export const clientRiskSnapshot = pgTable("client_risk_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  riskLevel: text("risk_level").notNull(),
  factors: jsonb("factors"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("client_risk_snapshot_client_id_period_unique").on(table.clientId, table.period),
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
  representativeId: uuid("representative_id").references(() => representative.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
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

/**
 * Representative portal access control: scoped access per representative user.
 * Controls which sections a representative user can view.
 */
export const representativeUserAccess = pgTable("representative_user_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("client_viewer"),
  canUploadDocuments: boolean("can_upload_documents").notNull().default(true),
  canViewDebts: boolean("can_view_debts").notNull().default(true),
  canViewIva: boolean("can_view_iva").notNull().default(true),
  canViewPayroll: boolean("can_view_payroll").notNull().default(false),
  canChatAi: boolean("can_chat_ai").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("representative_user_access_representative_id_user_id_unique").on(table.representativeId, table.userId),
]);

/**
 * Studio-to-client requests: tasks or document requests sent to client portal users.
 * Types: document, information, signature, other
 * Status: open, in_progress, completed, cancelled
 */
/** Employee event legajo history */
export const employeeEvent = pgTable("employee_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  empleadoId: uuid("empleado_id")
    .notNull()
    .references(() => liquidacionImportEmpleado.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: timestamp("event_date").notNull(),
  affectsPayroll: boolean("affects_payroll").notNull().default(false),
  metadata: jsonb("metadata"),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payrollPeriodNovelty = pgTable("payroll_period_novelty", {
  id: uuid("id").primaryKey().defaultRandom(),
  empleadoId: uuid("empleado_id")
    .notNull()
    .references(() => liquidacionImportEmpleado.id, { onDelete: "cascade" }),
  periodo: text("periodo").notNull(),
  type: text("type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  description: text("description"),
  appliedToReciboId: uuid("applied_to_recibo_id").references(
    () => liquidacionImportRecibo.id,
    { onDelete: "set null" }
  ),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payrollReceiptTemplate = pgTable("payroll_receipt_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  receiptType: text("receipt_type").notNull().default("sueldo"),
  conceptIds: jsonb("concept_ids"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Bank account per client/profile for reconciliation.
 */
export const bankAccount = pgTable("bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number"),
  currency: text("currency").notNull().default("ARS"),
  alias: text("alias"),
  cbu: text("cbu"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Bank transactions imported for reconciliation.
 * direction values: 'credit', 'debit'
 */
export const bankTransaction = pgTable("bank_transaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  transactionDate: timestamp("transaction_date").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  direction: text("direction").notNull(),
  counterpartyName: text("counterparty_name"),
  counterpartyIdentityNumber: text("counterparty_identity_number"),
  externalId: text("external_id"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Matches between bank transactions and invoices.
 * match_type values: 'auto', 'manual'
 */
export const bankInvoiceMatch = pgTable("bank_invoice_match", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankTransactionId: uuid("bank_transaction_id")
    .notNull()
    .references(() => bankTransaction.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id, { onDelete: "cascade" }),
  matchType: text("match_type").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Classification of financial movements for accounting and tax analysis.
 * source_type values: 'bank_transaction', 'invoice', 'movement'
 * classified_by values: 'system', 'user', 'ai'
 */
export const financialMovementClassification = pgTable("financial_movement_classification", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  isBusinessRelated: boolean("is_business_related").notNull().default(true),
  isTaxRelevant: boolean("is_tax_relevant").notNull().default(true),
  isCashflowReal: boolean("is_cashflow_real").notNull().default(true),
  notes: text("notes"),
  classifiedBy: text("classified_by").notNull().default("system"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const representativeRequest = pgTable("representative_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  representativeId: uuid("representative_id")
    .notNull()
    .references(() => representative.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
  requestedByUserId: text("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  status: text("status").notNull().default("open"),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ========== MÓDULO BALANCES / CONTABILIDAD GENERAL ==========
// Modelo según "Módulo de Balances V1" (PRD + 02_MODELO_DATOS).
// Multi-tenant: el plan base vive a nivel `organization`; todo lo demás
// (overrides, ejercicios, períodos, asientos, mayor) vive a nivel `client`
// (la "empresa fiscal" / `profile` del PRD).

/** scope='base' → cuenta del plan del estudio. scope='custom' → cuenta propia de una empresa. */
export const accountScopeEnum = pgEnum("account_scope", ["base", "custom"]);

/** imputable acepta movimientos; group solo suma (cuenta de agrupación). */
export const accountTypeEnum = pgEnum("account_type", ["imputable", "group"]);

/**
 * Rubro de exposición según RT FACPCE 8/9. Valores en español (términos
 * normativos argentinos que pierden sentido al traducirse).
 */
export const accountGroupEnum = pgEnum("account_group", [
  // Activo Corriente
  "caja_bancos",
  "inversiones_temporarias",
  "creditos_ventas",
  "otros_creditos_cte",
  "bienes_cambio",
  "otros_activos_cte",
  // Activo No Corriente
  "creditos_largo_plazo",
  "bienes_uso",
  "intangibles",
  "inversiones_permanentes",
  "otros_activos_no_cte",
  // Pasivo Corriente
  "deudas_comerciales",
  "deudas_financieras",
  "deudas_sociales",
  "deudas_fiscales",
  "otras_deudas_cte",
  // Pasivo No Corriente
  "deudas_largo_plazo",
  "previsiones",
  // Patrimonio Neto
  "capital",
  "aportes_irrevocables",
  "primas_emision",
  "reservas",
  "resultados_no_asignados",
  "resultado_ejercicio",
  // Resultados
  "ventas",
  "costo_ventas",
  "gastos_administracion",
  "gastos_comercializacion",
  "gastos_financieros",
  "otros_resultados_pos",
  "otros_resultados_neg",
  "impuesto_ganancias",
]);

/** Saldo esperado para validación de razonabilidad de signos. */
export const accountExpectedBalanceEnum = pgEnum("account_expected_balance", [
  "debit",
  "credit",
  "both",
]);

/** Clasificación de gasto para el ER (Anexo II). Solo aplica a cuentas de gasto. */
export const accountExpenseFunctionEnum = pgEnum("account_expense_function", [
  "administration",
  "sales",
  "financial",
  "other",
]);

/** Preparado para ajuste por inflación RT 6 (V1.5). No se usa funcionalmente en V1. */
export const accountInflationNatureEnum = pgEnum("account_inflation_nature", [
  "monetaria",
  "no_monetaria",
]);

/** Preparado para Estado de Flujo de Efectivo (V1.5). No se usa funcionalmente en V1. */
export const accountCashFlowActivityEnum = pgEnum("account_cash_flow_activity", [
  "operating",
  "investing",
  "financing",
]);

export const fiscalYearStatusEnum = pgEnum("fiscal_year_status", [
  "open",
  "closing",
  "closed",
]);

export const accountingPeriodStatusEnum = pgEnum("accounting_period_status", [
  "open",
  "closed",
]);

export const journalEntryOriginEnum = pgEnum("journal_entry_origin", [
  "manual",
  "auto_invoice",
  "auto_payroll",
  "auto_closing",
  "auto_opening",
  "import_excel",
]);

export const journalEntrySourceTypeEnum = pgEnum("journal_entry_source_type", [
  "invoice",
  "payroll",
  "closing",
]);

export const accountingLogEventTypeEnum = pgEnum("accounting_log_event_type", [
  "period_closed",
  "period_reopened",
  "fiscal_year_closed",
  "fiscal_year_reopened",
  "journal_entry_created",
  "journal_entry_edited",
  "journal_entry_voided",
  "account_created",
  "account_deactivated",
  "financial_statement_approved",
]);

/**
 * Plan de cuentas. Vive en dos niveles según `scope`:
 * - scope='base': cuenta del plan base del estudio. organizationId set, clientId null.
 *   Disponible (referenciada, no clonada) para todas las empresas del estudio.
 * - scope='custom': cuenta creada por una empresa puntual. clientId set (rango 9.x.xx).
 *
 * Nota: la tabla física se llama "accounting_account" para no colisionar con la
 * tabla "account" de Better Auth (credenciales OAuth). El export JS sigue siendo
 * `account` por brevedad en las queries del módulo.
 */
export const account = pgTable(
  "accounting_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: accountScopeEnum("scope").notNull(),
    /** Siempre seteado, también para cuentas custom (el estudio dueño). */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** NULL si scope='base'; NOT NULL si scope='custom'. */
    clientId: uuid("client_id").references(() => client.id, { onDelete: "cascade" }),
    /** Código jerárquico, ej. "1.1.01.001". */
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: accountTypeEnum("type").notNull(),
    /** FK self → account.id (jerarquía). Puede apuntar a una cuenta de cualquier scope. */
    parentId: uuid("parent_id"),
    /** Rubro de exposición. NULL en nodos estructurales de agrupación (ej. "Activo"); requerido en imputables. */
    accountGroup: accountGroupEnum("account_group"),
    /** Saldo esperado para validación de razonabilidad. NULL en nodos de agrupación. */
    expectedBalance: accountExpectedBalanceEnum("expected_balance"),
    expenseFunction: accountExpenseFunctionEnum("expense_function"),
    inflationNature: accountInflationNatureEnum("inflation_nature"),
    cashFlowActivity: accountCashFlowActivityEnum("cash_flow_activity"),
    /** Cuentas críticas del sistema (ej. pending_review, resultado_ejercicio). No se borran, desactivan ni renombran. */
    isSystemAccount: boolean("is_system_account").notNull().default(false),
    /** Default global de la cuenta. La activación efectiva por empresa se resuelve con accountOverride. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "account_parent_id_fkey",
    }).onDelete("set null"),
    // Códigos base únicos por estudio.
    uniqueIndex("account_base_org_code_unique")
      .on(table.organizationId, table.code)
      .where(sql`scope = 'base'`),
    // Códigos custom únicos por empresa.
    uniqueIndex("account_custom_client_code_unique")
      .on(table.clientId, table.code)
      .where(sql`scope = 'custom'`),
    index("idx_account_org_scope").on(table.organizationId, table.scope),
    index("idx_account_client").on(table.clientId),
  ],
);

/**
 * Override de una cuenta base para una empresa puntual: permite activar/desactivar
 * y renombrar sin clonar el plan. Si no existe override, vale el atributo de la cuenta base.
 */
export const accountOverride = pgTable(
  "account_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    /** Override del isActive base. NULL = usar el default de la cuenta base. */
    isActive: boolean("is_active"),
    /** Renombre solo para esta empresa. NULL = usar el nombre base. */
    customName: text("custom_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("account_override_client_account_unique").on(table.clientId, table.accountId),
  ],
);

/** Ejercicio fiscal (típico 12 meses calendario) por empresa. */
export const fiscalYear = pgTable(
  "fiscal_year",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    startDate: timestamp("start_date", { mode: "date" }).notNull(),
    endDate: timestamp("end_date", { mode: "date" }).notNull(),
    status: fiscalYearStatusEnum("status").notNull().default("open"),
    /** N° de ejercicio (1, 2, 3...). */
    number: integer("number").notNull(),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    reopenedAt: timestamp("reopened_at"),
    reopenedBy: text("reopened_by").references(() => user.id, { onDelete: "set null" }),
    reopenReason: text("reopen_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_fiscal_year_client").on(table.clientId),
    unique("fiscal_year_client_number_unique").on(table.clientId, table.number),
  ],
);

/** Período mensual dentro de un ejercicio. Se crean los 12 al abrir el ejercicio. */
export const accountingPeriod = pgTable(
  "accounting_period",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "cascade" }),
    /** Denormalizado para queries de mayor. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: accountingPeriodStatusEnum("status").notNull().default("open"),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_accounting_period_client_fy").on(table.clientId, table.fiscalYearId),
    unique("accounting_period_fy_year_month_unique").on(
      table.fiscalYearId,
      table.year,
      table.month,
    ),
  ],
);

/** Asiento contable (cabecera). Numeración consecutiva por ejercicio. */
export const journalEntry = pgTable(
  "journal_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "cascade" }),
    periodId: uuid("period_id")
      .notNull()
      .references(() => accountingPeriod.id, { onDelete: "restrict" }),
    /** Numeración consecutiva por ejercicio, sin saltos. */
    number: integer("number").notNull(),
    entryDate: timestamp("entry_date", { mode: "date" }).notNull(),
    description: text("description"),
    origin: journalEntryOriginEnum("origin").notNull().default("manual"),
    sourceType: journalEntrySourceTypeEnum("source_type"),
    /** FK a la entidad origen (invoice.id, liquidacionImportRecibo.id, etc.). */
    sourceId: uuid("source_id"),
    /** FK opcional → ledgerMappingRule. Solo en asientos generados por una regla. */
    mappingRuleId: uuid("mapping_rule_id").references(() => ledgerMappingRule.id, {
      onDelete: "set null",
    }),
    isVoided: boolean("is_voided").notNull().default(false),
    voidedAt: timestamp("voided_at"),
    voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    /** True si origin=auto pero el contador lo editó. */
    isEditedPostGeneration: boolean("is_edited_post_generation").notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_journal_entry_client_fy").on(table.clientId, table.fiscalYearId),
    index("idx_journal_entry_client_period_voided").on(
      table.clientId,
      table.periodId,
      table.isVoided,
    ),
    unique("journal_entry_client_fy_number_unique").on(
      table.clientId,
      table.fiscalYearId,
      table.number,
    ),
  ],
);

/** Línea de asiento (debe/haber). Una línea tiene debit>0 XOR credit>0. */
export const journalEntryLine = pgTable(
  "journal_entry_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntry.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    /** Denormalizado para queries de mayor. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    /** Denormalizado para queries de mayor. */
    periodId: uuid("period_id")
      .notNull()
      .references(() => accountingPeriod.id, { onDelete: "restrict" }),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    description: text("description"),
    lineOrder: integer("line_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_jel_client_account_period").on(
      table.clientId,
      table.accountId,
      table.periodId,
    ),
    index("idx_jel_journal_entry").on(table.journalEntryId),
  ],
);

/** Log auditable de acciones contables sensibles (append-only, inmutable). */
export const accountingLog = pgTable(
  "accounting_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    fiscalYearId: uuid("fiscal_year_id").references(() => fiscalYear.id, {
      onDelete: "set null",
    }),
    eventType: accountingLogEventTypeEnum("event_type").notNull(),
    /** Snapshot del estado antes/después. */
    eventData: jsonb("event_data"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_accounting_log_client").on(table.clientId)],
);

/* ───────── Estados Contables (paquete EECC, Fase 6) ───────── */

export const financialStatementStatusEnum = pgEnum(
  "financial_statement_status",
  ["draft", "approved"],
);

/**
 * Paquete de Estados Contables de un ejercicio (notas libres + estado de aprobación).
 * El ESP/ER/Anexo II se calculan on-the-fly desde los asientos; acá se persisten las
 * notas markdown del Owner y la aprobación formal. Uno por ejercicio.
 * Al aprobar (status='approved') las notas quedan inmutables hasta reabrir a borrador.
 */
export const financialStatement = pgTable(
  "financial_statement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "cascade" }),
    status: financialStatementStatusEnum("status").notNull().default("draft"),
    /** Notas markdown en orden de exposición: [{ id, title, content }]. */
    notes: jsonb("notes").notNull().default([]),
    approvedAt: timestamp("approved_at"),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** PDF del paquete EECC generado, como data URL base64 (US 7.1.1). */
    pdfUrl: text("pdf_url"),
    pdfSizeBytes: integer("pdf_size_bytes"),
    pdfGeneratedAt: timestamp("pdf_generated_at"),
    pdfGeneratedBy: text("pdf_generated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("financial_statement_fy_unique").on(table.fiscalYearId),
    index("idx_financial_statement_client").on(table.clientId),
  ],
);

/**
 * Anexo de Costo de Mercadería Vendida (CMV) por ejercicio. Carga MANUAL por ahora
 * (método diferencia de inventario): CMV = existencia inicial + compras/gastos − existencia final.
 * Es un anexo explicativo; no alimenta automáticamente el "Costo de ventas" del ER
 * (ese sale de los asientos). Uno por ejercicio.
 */
export const cmvAnnex = pgTable(
  "cmv_annex",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    fiscalYearId: uuid("fiscal_year_id")
      .notNull()
      .references(() => fiscalYear.id, { onDelete: "cascade" }),
    /** Existencia de mercaderías al inicio del ejercicio. */
    existenciaInicial: numeric("existencia_inicial", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    /** Compras / gastos del ejercicio. */
    comprasGastos: numeric("compras_gastos", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    /** Existencia de mercaderías al cierre del ejercicio. */
    existenciaFinal: numeric("existencia_final", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("cmv_annex_fy_unique").on(table.fiscalYearId),
    index("idx_cmv_annex_client").on(table.clientId),
  ],
);

/* ───────── Reglas de mapeo (asientos automáticos, Fase 3) ───────── */

/** Módulo origen del comprobante que dispara la regla. */
export const ledgerMappingSourceModuleEnum = pgEnum("ledger_mapping_source_module", [
  "invoice",
  "payroll",
]);

/** default = fallback; conditional = se aplica si matchea la condición jsonb. */
export const ledgerMappingRuleTypeEnum = pgEnum("ledger_mapping_rule_type", [
  "default",
  "conditional",
]);

export const ledgerMappingLineSideEnum = pgEnum("ledger_mapping_line_side", [
  "debit",
  "credit",
]);

/** Base sobre la que se calcula el monto de cada línea generada. */
export const ledgerMappingAmountBasisEnum = pgEnum("ledger_mapping_amount_basis", [
  "total",
  "net",
  "vat",
  "other_taxes",
  "concept_value",
  "fixed",
]);

/**
 * Cabecera de la regla de mapeo comprobante→asiento. Define cuándo se aplica.
 * Las cuentas y montos viven en ledgerMappingRuleLine. Vive a nivel `client` (empresa).
 */
export const ledgerMappingRule = pgTable(
  "ledger_mapping_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceModule: ledgerMappingSourceModuleEnum("source_module").notNull(),
    ruleType: ledgerMappingRuleTypeEnum("rule_type").notNull().default("default"),
    /** Criterios de matching cuando ruleType='conditional' (ej. {"direction":"sale","invoiceType":"A"}). */
    condition: jsonb("condition"),
    /** Orden de evaluación: las más específicas (menor número) primero. */
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_ledger_mapping_rule_client").on(table.clientId, table.sourceModule),
  ],
);

/**
 * Línea-plantilla de una regla: qué cuenta, de qué lado y cómo se calcula el monto.
 * Una regla generará un asiento con N líneas a partir de estas plantillas.
 */
export const ledgerMappingRuleLine = pgTable(
  "ledger_mapping_rule_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => ledgerMappingRule.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    side: ledgerMappingLineSideEnum("side").notNull(),
    amountBasis: ledgerMappingAmountBasisEnum("amount_basis").notNull(),
    /** Monto fijo cuando amountBasis='fixed'; NULL en los demás casos. */
    fixedAmount: numeric("fixed_amount", { precision: 18, scale: 2 }),
    lineOrder: integer("line_order").notNull().default(0),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_ledger_mapping_rule_line_rule").on(table.ruleId)],
);

/**
 * Cierre de la liquidación de sueldos de un período (US 3.3.1).
 *
 * Materializa el evento "liquidación cerrada": el módulo de sueldos no tenía una
 * entidad de liquidación con estado — solo recibos por empleado. Una fila acá es
 * el disparador del asiento automático y el destino de `journalEntry.sourceId`,
 * lo que da idempotencia (unique por empresa+período) y permite reabrir.
 */
export const payrollLiquidacionCierre = pgTable(
  "payroll_liquidacion_cierre",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Empresa con CUIT propio (client). */
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    /** Período liquidado, formato "YYYY-MM". */
    periodo: text("periodo").notNull(),
    /** Asiento generado al cerrar. NULL si el cierre aún no pudo contabilizarse. */
    journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id, {
      onDelete: "set null",
    }),
    /** Cantidad de recibos incluidos en el cierre. */
    recibos: integer("recibos").notNull().default(0),
    /** Cantidad de conceptos agregados que no matchearon ninguna regla. */
    conceptosSinRegla: integer("conceptos_sin_regla").notNull().default(0),
    closedAt: timestamp("closed_at").defaultNow().notNull(),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    /** Seteado al reabrir; la fila se conserva como historial. */
    reopenedAt: timestamp("reopened_at"),
    reopenedBy: text("reopened_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    /**
     * Único solo entre los cierres VIGENTES: al reabrir, la fila se conserva
     * como historial y debe poder crearse un cierre nuevo del mismo período.
     */
    uniqueIndex("payroll_liquidacion_cierre_client_periodo_unique")
      .on(table.clientId, table.periodo)
      .where(sql`reopened_at is null`),
    index("idx_payroll_liquidacion_cierre_client").on(table.clientId, table.periodo),
  ],
);

/* ───────── Bienes de uso (Fase 4) ───────── */

/** Categoría del bien de uso (alineada con los rubros de exposición del Anexo I). */
export const fixedAssetCategoryEnum = pgEnum("fixed_asset_category", [
  "rodados",
  "muebles_utiles",
  "equipos_computacion",
  "instalaciones",
  "inmuebles",
  "maquinarias",
  "otros",
]);

/** Método de amortización. Por ahora solo lineal. */
export const fixedAssetMethodEnum = pgEnum("fixed_asset_method", ["linear"]);

export const fixedAssetStatusEnum = pgEnum("fixed_asset_status", [
  "active",
  "sold",
  "discarded",
]);

/** Motivo de baja del bien. */
export const fixedAssetDisposalReasonEnum = pgEnum("fixed_asset_disposal_reason", [
  "sale",
  "disuse",
  "destruction",
]);

/**
 * Bien de uso de una empresa. Insumo del Anexo I y de los asientos de amortización
 * al cierre. La amortización (lineal) se calcula on-the-fly, no se persiste por mes.
 * Vive a nivel `client` (empresa).
 */
export const fixedAsset = pgTable(
  "fixed_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: fixedAssetCategoryEnum("category").notNull(),
    /** Cuenta del activo (bienes_uso, saldo deudor). */
    assetAccountId: uuid("asset_account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    /** Cuenta regularizadora "(-) Amortización acumulada" (bienes_uso, saldo acreedor). */
    accumDeprAccountId: uuid("accum_depr_account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    /** Cuenta de gasto "Amortización del ejercicio" (resultado negativo). */
    deprExpenseAccountId: uuid("depr_expense_account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    acquisitionDate: timestamp("acquisition_date", { mode: "date" }).notNull(),
    originalValue: numeric("original_value", { precision: 18, scale: 2 }).notNull(),
    usefulLifeYears: integer("useful_life_years").notNull(),
    residualValue: numeric("residual_value", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    method: fixedAssetMethodEnum("method").notNull().default("linear"),
    status: fixedAssetStatusEnum("status").notNull().default("active"),
    disposalDate: timestamp("disposal_date", { mode: "date" }),
    disposalReason: fixedAssetDisposalReasonEnum("disposal_reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_fixed_asset_client_status").on(table.clientId, table.status),
  ],
);

/**
 * Tax projections per client and period for estimated vs actual tracking.
 * Unique on (client_id, period, tax).
 */
export const taxProjection = pgTable("tax_projection", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  tax: text("tax").notNull(),
  projectedAmount: numeric("projected_amount", { precision: 14, scale: 2 }).notNull(),
  confidence: text("confidence"),
  factors: jsonb("factors"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => [
  unique("tax_projection_client_id_period_tax_unique").on(table.clientId, table.period, table.tax),
]);

/**
 * Feature flags per organization to enable/disable modules.
 * Modules: sueldos, banco, contabilidad, analytics, portal_cliente, ai_agent
 */
export const organizationModule = pgTable(
  "organization_module",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    enabledAt: timestamp("enabled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("organization_module_org_id_module_unique").on(table.organizationId, table.module),
  ],
);

/**
 * Parámetros laborales por período mensual.
 * Almacena el tope máximo imponible (basado en RIPTE publicado por ANSES),
 * el SMVM vigente y otros parámetros que cambian mensualmente.
 * Se popula automáticamente via cron (día 5 de cada mes) o manualmente.
 * PK = periodo "YYYY-MM" — una sola fila por mes, historial completo.
 */
export const payrollParametrosPeriodo = pgTable("payroll_parametros_periodo", {
  /** Período en formato "YYYY-MM". Clave primaria — una fila por mes. */
  periodo: text("periodo").primaryKey(),
  /**
   * Tope máximo imponible para aportes y contribuciones previsionales (jubilación, PAMI, OS).
   * Publicado mensualmente por ANSES. Se aplica como techo de la base imponible en Record 04 del LSD.
   */
  topeMaximoImponible: numeric("tope_maximo_imponible", { precision: 14, scale: 2 }).notNull(),
  /**
   * Salario Mínimo Vital y Móvil vigente para el período.
   * Nullable — puede no estar disponible o no ser necesario para todos los cálculos.
   */
  salarioMinimo: numeric("salario_minimo", { precision: 14, scale: 2 }),
  /** Referencia de la norma o URL fuente de donde se extrajeron los valores. */
  fuente: text("fuente"),
  /** Indica si el registro fue creado/actualizado por el cron automático (true) o cargado manualmente (false). */
  actualizadoPorCron: boolean("actualizado_por_cron").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Registro de cada presentación LSD generada y descargada.
 * Nro 1 = presentación original; nro 2+ = rectificativas.
 * El campo `contenido` guarda el archivo completo para auditoría y re-descarga.
 */
export const payrollLsdPresentacion = pgTable(
  "payroll_lsd_presentacion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK a la empresa (client con CUIT propio). */
    profileId: uuid("profile_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    /** Período en formato "YYYY-MM". */
    periodo: text("periodo").notNull(),
    /** Número secuencial de presentación para el período (1, 2, 3...). */
    nroPresentacion: integer("nro_presentacion").notNull(),
    /** Nombre del archivo generado (ej. "30717554864_2026_05_LSD.txt"). */
    filename: text("filename").notNull(),
    /** Cantidad de empleados incluidos en la presentación. */
    empleados: integer("empleados").notNull(),
    /** Cantidad de líneas de conceptos (R03) en la presentación. */
    conceptos: integer("conceptos").notNull(),
    /** Contenido completo del archivo LSD (texto plano). */
    contenido: text("contenido").notNull(),
    /** Fecha y hora en que se generó la presentación. */
    generadoEn: timestamp("generado_en").defaultNow().notNull(),
  },
  (t) => [unique("uq_lsd_pres_profile_periodo_nro").on(t.profileId, t.periodo, t.nroPresentacion)]
);

/**
 * Datos del contador firmante del estudio, para el bloque de firma de los
 * Estados Contables (EECC). Uno por organización.
 */
export const accountantSignature = pgTable("accountant_signature", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Nombre y apellido del contador. */
  nombre: text("nombre"),
  /** Título profesional (ej. "Contador Público"). */
  titulo: text("titulo").notNull().default("Contador Público"),
  /** Universidad (ej. "U.B.A."). */
  universidad: text("universidad"),
  /** Consejo profesional (ej. "C.P.C.E.C.A.B.A."). */
  consejo: text("consejo"),
  /** Tomo de la matrícula. */
  tomo: text("tomo"),
  /** Folio de la matrícula. */
  folio: text("folio"),
  /** Imagen de la firma (data URL base64), opcional. */
  firmaImagen: text("firma_imagen"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
