-- ============================================================================
-- BD_IDEAL — Dominio 2: Fiscal / comprobantes (tasks/modelo-ideal-db.md §5)
-- Depende de schema-dominio1.sql (cliente, contraparte, credencial_afip).
-- ============================================================================

create type comprobante_direccion as enum ('emitido', 'recibido');
create type comprobante_clase as enum ('factura', 'nota_credito', 'nota_debito', 'recibo', 'tique');
create type dato_fuente as enum ('scraper', 'manual', 'import', 'ai', 'calculo');
create type deuda_estado as enum ('abierta', 'pagada', 'plan_pago', 'prescripta');
create type notificacion_severidad as enum ('sin_clasificar', 'informativa', 'accion_requerida', 'urgente');

-- ============================================================================
-- CATÁLOGO DE TIPOS DE COMPROBANTE (global, códigos AFIP)
-- ============================================================================

create table comprobante_tipo (
  codigo smallint primary key,
  descripcion text not null,
  letra char(1),
  clase comprobante_clase not null,
  es_nc boolean not null,
  discrimina_iva boolean not null
);

comment on table comprobante_tipo is
  'Códigos oficiales de AFIP. Existe para que la semántica salga del dato y no de listas hardcodeadas en TS (hoy INVOICE_TYPES_A / CREDIT_NOTE_TYPES en src/lib/iva-calc.ts).';
comment on column comprobante_tipo.es_nc is
  'Nota de crédito. Regla IVA (arts. 11 y 12): la NC RECIBIDA de un proveedor integra el DÉBITO fiscal y la NC EMITIDA a un cliente integra el CRÉDITO fiscal — no se resta del lado donde se emitió.';
comment on column comprobante_tipo.discrimina_iva is
  'Si el comprobante le discrimina el IVA a QUIEN LO RECIBE, o sea si le da crédito fiscal computable: true en letras A y M, false en B, C, E y T. NO significa "no hay desglose por alícuota" — son dos cosas distintas y confundirlas hace mal el cálculo. Que exista desglose depende del tipo Y de la direccion: una factura B EMITIDA sí lo trae (el emisor sabe cuánto IVA cobró aunque no se lo muestre al comprador: 53.725 de 53.805 reales tienen filas en comprobante_alicuota), y una B RECIBIDA no (0 de 932), porque para el receptor ese IVA no es computable. El crédito fiscal se decide solo con esta columna.';
comment on column comprobante_tipo.letra is
  'A/M: discriminan IVA. B: IVA incluido (a consumidor final o exento). C: emisor monotributista o exento. E: exportación. T: turista.';

insert into comprobante_tipo (codigo, descripcion, letra, clase, es_nc, discrimina_iva) values
  (1,   'Factura A',                          'A', 'factura',      false, true),
  (2,   'Nota de Débito A',                   'A', 'nota_debito',  false, true),
  (3,   'Nota de Crédito A',                  'A', 'nota_credito', true,  true),
  (4,   'Recibo A',                           'A', 'recibo',       false, true),
  (6,   'Factura B',                          'B', 'factura',      false, false),
  (7,   'Nota de Débito B',                   'B', 'nota_debito',  false, false),
  (8,   'Nota de Crédito B',                  'B', 'nota_credito', true,  false),
  (9,   'Recibo B',                           'B', 'recibo',       false, false),
  (11,  'Factura C',                          'C', 'factura',      false, false),
  (12,  'Nota de Débito C',                   'C', 'nota_debito',  false, false),
  (13,  'Nota de Crédito C',                  'C', 'nota_credito', true,  false),
  (15,  'Recibo C',                           'C', 'recibo',       false, false),
  (19,  'Factura de Exportación',             'E', 'factura',      false, false),
  (20,  'Nota de Débito por Exportación',     'E', 'nota_debito',  false, false),
  (21,  'Nota de Crédito por Exportación',    'E', 'nota_credito', true,  false),
  (51,  'Factura M',                          'M', 'factura',      false, true),
  (52,  'Nota de Débito M',                   'M', 'nota_debito',  false, true),
  (53,  'Nota de Crédito M',                  'M', 'nota_credito', true,  true),
  (54,  'Recibo M',                           'M', 'recibo',       false, true),
  -- Liquidaciones y cuentas de venta. Aparecen en el libro de COMPRAS (agro,
  -- consignaciones). Faltaban: un ZIP de recibidos con un código 63 abortaba la
  -- importación entera del perfil y dejaba las compras en cero — con la posición
  -- de IVA en pantalla mal por un orden de magnitud (14/08, Termomecanica Valtri).
  -- `clase` no participa de ningún cálculo (sólo lo hacen es_nc y discrimina_iva),
  -- así que van como 'factura', que es como se comportan a efectos del IVA.
  (60,  'Cuenta de Venta y Líquido producto A', 'A', 'factura',    false, true),
  (61,  'Cuenta de Venta y Líquido producto B', 'B', 'factura',    false, false),
  (63,  'Liquidación A',                      'A', 'factura',      false, true),
  (64,  'Liquidación B',                      'B', 'factura',      false, false),
  (81,  'Tique Factura A',                    'A', 'tique',        false, true),
  (82,  'Tique Factura B',                    'B', 'tique',        false, false),
  (83,  'Tique',                              null, 'tique',       false, false),
  (109, 'Tique C',                            'C', 'tique',        false, false),
  (110, 'Tique Nota de Crédito',              null, 'nota_credito', true, false),
  (111, 'Tique Factura C',                    'C', 'tique',        false, false),
  (112, 'Tique Nota de Crédito A',            'A', 'nota_credito', true,  true),
  (113, 'Tique Nota de Crédito B',            'B', 'nota_credito', true,  false),
  (114, 'Tique Nota de Crédito C',            'C', 'nota_credito', true,  false),
  (115, 'Tique Nota de Débito A',             'A', 'nota_debito',  false, true),
  (116, 'Tique Nota de Débito B',             'B', 'nota_debito',  false, false),
  (117, 'Tique Nota de Débito C',             'C', 'nota_debito',  false, false),
  (195, 'Factura T',                          'T', 'factura',      false, false),
  (196, 'Nota de Débito T',                   'T', 'nota_debito',  false, false),
  (197, 'Nota de Crédito T',                  'T', 'nota_credito', true,  false),
  (201, 'Factura de Crédito electrónica MiPyME (FCE) A', 'A', 'factura',      false, true),
  (202, 'Nota de Débito electrónica MiPyME (FCE) A',     'A', 'nota_debito',  false, true),
  (203, 'Nota de Crédito electrónica MiPyME (FCE) A',    'A', 'nota_credito', true,  true),
  (206, 'Factura de Crédito electrónica MiPyME (FCE) B', 'B', 'factura',      false, false),
  (207, 'Nota de Débito electrónica MiPyME (FCE) B',     'B', 'nota_debito',  false, false),
  (208, 'Nota de Crédito electrónica MiPyME (FCE) B',    'B', 'nota_credito', true,  false),
  (211, 'Factura de Crédito electrónica MiPyME (FCE) C', 'C', 'factura',      false, false),
  (212, 'Nota de Débito electrónica MiPyME (FCE) C',     'C', 'nota_debito',  false, false),
  (213, 'Nota de Crédito electrónica MiPyME (FCE) C',    'C', 'nota_credito', true,  false);

-- ============================================================================
-- COMPROBANTES
-- ============================================================================

create table comprobante (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  direccion comprobante_direccion not null,
  tipo smallint not null references comprobante_tipo(codigo),
  punto_venta integer not null,
  numero bigint not null,
  fecha_emision date not null,
  periodo date generated always as (date_trunc('month', fecha_emision::timestamp)::date) stored,
  contraparte_id uuid not null references contraparte(id),
  moneda char(3) not null default 'ARS',
  cotizacion numeric(15, 4) not null default 1,
  neto_gravado numeric(15, 2) not null default 0,
  neto_no_gravado numeric(15, 2) not null default 0,
  exento numeric(15, 2) not null default 0,
  otros_tributos numeric(15, 2) not null default 0,
  iva_total numeric(15, 2) not null default 0,
  total numeric(15, 2) not null,
  cae text,
  fuente dato_fuente not null default 'scraper',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, direccion, contraparte_id, tipo, punto_venta, numero)
);
create index idx_comprobante_cliente_periodo on comprobante(cliente_id, periodo);
create index idx_comprobante_org on comprobante(org_id);
create index idx_comprobante_contraparte on comprobante(contraparte_id);
create index idx_comprobante_fecha on comprobante(fecha_emision);
create trigger trg_set_updated_at before update on comprobante for each row execute function set_updated_at();

comment on table comprobante is
  'Cabecera de factura/NC/ND/recibo, emitido o recibido por un cliente del estudio. Reemplaza la tabla invoice y sus 10 columnas fijas de IVA: el detalle por alícuota vive en comprobante_alicuota.';
comment on column comprobante.direccion is
  'emitido = lo emitió el cliente (venta, débito fiscal). recibido = se lo emitieron al cliente (compra, crédito fiscal). El CUIT del propio cliente nunca se repite acá: del otro lado siempre está contraparte_id.';
comment on column comprobante.periodo is
  'Mes de imputación (primer día del mes), derivado de fecha_emision. Generada: nunca hace falta parsear ni truncar en las queries.';
comment on column comprobante.numero is
  'Número del comprobante. En los recibidos lo pone el emisor, por eso la clave única incluye contraparte_id: dos proveedores distintos pueden mandar el mismo punto de venta + número.';
comment on column comprobante.total is
  'Importe total, SIEMPRE POSITIVO, incluidas las notas de crédito. AFIP no manda el signo; el signo lo decide el cálculo según comprobante_tipo.es_nc.';
comment on column comprobante.cae is
  'CAE/CAEA de AFIP. Casi único pero no confiable como clave: hay repetidos en los datos reales.';

create table comprobante_alicuota (
  id uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references comprobante(id) on delete cascade,
  alicuota numeric(5, 2) not null,
  neto numeric(15, 2) not null,
  iva numeric(15, 2) not null,
  unique (comprobante_id, alicuota)
);
create index idx_comprobante_alicuota_comprobante on comprobante_alicuota(comprobante_id);

comment on table comprobante_alicuota is
  'Una fila por alícuota realmente usada (en los datos reales: 21.00, 10.50, 27.00, 0.00 y un único caso de 2.50). Una alícuota nueva de AFIP es una fila más, nunca una migración. Que un comprobante NO tenga filas acá es esperable en tres casos y solo en esos tres: letra C (emisor monotributista o exento, no hay IVA), letra E (exportación) y letra B RECIBIDA (existe el IVA pero AFIP no lo desglosa al receptor porque no se lo puede computar). Una B EMITIDA sí trae desglose. Por lo tanto, un comprobante letra A o M sin filas acá y con iva_total distinto de cero es una CONTRADICCIÓN detectable: el dato llegó incompleto del scraping.';

-- ============================================================================
-- IVA DECLARADO (F2051 scrapeado — dato de contraste, nunca calculado)
-- ============================================================================

create table iva_declaracion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  presentada_at date,
  debito_fiscal numeric(15, 2),
  credito_fiscal numeric(15, 2),
  saldo_mes_anterior numeric(15, 2),
  saldo_afip_mes numeric(15, 2),
  saldo_tecnico_favor numeric(15, 2),
  saldo_tecnico_favor_mensual numeric(15, 2),
  saldo_libre_disponibilidad_anterior_neto numeric(15, 2),
  retenciones_percepciones_periodo numeric(15, 2),
  saldo_libre_disponibilidad_favor numeric(15, 2),
  fuente dato_fuente not null default 'scraper',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);
create trigger trg_set_updated_at before update on iva_declaracion for each row execute function set_updated_at();

comment on table iva_declaracion is
  'F2051 de AFIP (la DDJJ de IVA tal como la presentó el cliente). Es el dato de VERDAD contra el que se contrasta el IVA calculado desde comprobante — nunca se calcula ni se corrige acá.';
comment on column iva_declaracion.periodo is 'Primer día del mes declarado.';

-- ============================================================================
-- OBLIGACIONES FISCALES (deuda y vencimientos)
-- ============================================================================

create table deuda (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  credencial_id uuid not null references credencial_afip(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete cascade,
  cuit text not null,
  impuesto text not null,
  concepto text not null,
  sub_concepto text,
  periodo date,
  cuota numeric(5, 0),
  vence_at date,
  establecimiento text,
  saldo numeric(15, 2) not null default 0,
  interes_resarcitorio numeric(15, 2) not null default 0,
  interes_punitorio numeric(15, 2) not null default 0,
  estado deuda_estado not null default 'abierta',
  intimada boolean not null default false,
  detectada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_deuda_cliente on deuda(cliente_id);
create index idx_deuda_credencial on deuda(credencial_id);
create index idx_deuda_org on deuda(org_id);
create trigger trg_set_updated_at before update on deuda for each row execute function set_updated_at();

create table vencimiento (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  credencial_id uuid not null references credencial_afip(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete cascade,
  cuit text not null,
  impuesto text not null,
  concepto text not null,
  sub_concepto text,
  periodo date,
  cuota numeric(5, 0),
  vence_at date not null,
  detalle text,
  completado_at timestamptz,
  completado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_vencimiento_cliente on vencimiento(cliente_id);
create index idx_vencimiento_credencial on vencimiento(credencial_id);
create index idx_vencimiento_vence on vencimiento(vence_at);
create trigger trg_set_updated_at before update on vencimiento for each row execute function set_updated_at();

-- La obligación (qué impuesto, de qué período, de quién y para cuándo) es la
-- identidad de la fila; los importes son su estado y cambian de un scrapeo a
-- otro. Sin esta clave el scrapper dedupeaba comparando campo por campo y
-- cualquier diferencia de representación (el caso real: la misma fecha guardada
-- como timestamp a las 03:00Z y a las 06:00Z) volvía a insertar la deuda entera.
-- `nulls not distinct` porque sub_concepto/periodo/cuota son opcionales y dos
-- nulls acá son el mismo dato, no dos datos desconocidos.
create unique index uq_deuda_obligacion on deuda
  (credencial_id, cuit, establecimiento, impuesto, concepto, sub_concepto, periodo, cuota, vence_at)
  nulls not distinct;
create unique index uq_vencimiento_obligacion on vencimiento
  (credencial_id, cuit, impuesto, concepto, sub_concepto, periodo, cuota, vence_at)
  nulls not distinct;

comment on table deuda is
  'Deuda del CCMA de AFIP. El sujeto de la deuda es un CUIT, no necesariamente un cliente: AFIP también devuelve la deuda del titular del login.';
comment on table vencimiento is
  'Calendario de vencimientos de AFIP. Se baja UNA VEZ POR LOGIN (el CSV no trae CUIT por fila), así que hoy todos los vencimientos son del CUIT del login.';
comment on column deuda.cuit is
  'CUIT dueño de la obligación. Si ese CUIT es cliente del estudio, cliente_id apunta al cliente; si es el CUIT del propio login, cliente_id queda null.';
comment on column vencimiento.cuit is
  'CUIT dueño de la obligación. Si ese CUIT es cliente del estudio, cliente_id apunta al cliente; si es el CUIT del propio login, cliente_id queda null.';
comment on column deuda.credencial_id is 'Con qué login de AFIP se scrapeó (nunca null: el dato siempre viene de un login).';
comment on column vencimiento.credencial_id is 'Con qué login de AFIP se scrapeó (nunca null: el dato siempre viene de un login).';

-- ============================================================================
-- NOTIFICACIONES (e-Ventanilla / Domicilio Fiscal Electrónico)
-- ============================================================================

create table notificacion (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  credencial_id uuid not null references credencial_afip(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete cascade,
  external_id text,
  mensaje text not null,
  publicada_at timestamptz,
  vence_at timestamptz,
  leida boolean not null default false,
  severidad notificacion_severidad not null default 'sin_clasificar',
  categoria text,
  ai_resumen text,
  ai_clasificada_at timestamptz,
  asignada_a text references "user"(id) on delete set null,
  resuelta_at timestamptz,
  resuelta_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_notificacion_cliente on notificacion(cliente_id);
create index idx_notificacion_credencial on notificacion(credencial_id);
create index idx_notificacion_org on notificacion(org_id);
create trigger trg_set_updated_at before update on notificacion for each row execute function set_updated_at();

comment on table notificacion is
  'Mensaje del Domicilio Fiscal Electrónico de AFIP. Como deuda/vencimiento, puede ser del CUIT del login y no de un cliente (cliente_id null).';
comment on column notificacion.severidad is
  'La completa el agente que clasifica notificaciones; sin_clasificar = todavía no la miró nadie.';
comment on column notificacion.categoria is
  'Texto libre por ahora: el vocabulario lo va a fijar el estudio cuando el agente clasificador esté en uso.';

-- ============================================================================
-- INGRESOS BRUTOS
-- ============================================================================

create table liquidacion_iibb (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  provincia text not null,
  alicuota numeric(7, 6) not null,
  saldo_a_favor numeric(15, 2) not null default 0,
  percepciones_agentes numeric(15, 2) not null default 0,
  percepciones_aduaneras numeric(15, 2) not null default 0,
  retenciones_agentes numeric(15, 2) not null default 0,
  retenciones_bancarias numeric(15, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo, provincia)
);
create index idx_liquidacion_iibb_cliente on liquidacion_iibb(cliente_id);
create trigger trg_set_updated_at before update on liquidacion_iibb for each row execute function set_updated_at();

comment on table liquidacion_iibb is
  'Datos que carga el estudio para liquidar Ingresos Brutos de un cliente en un período y una provincia. La base imponible sale de los comprobantes; acá van la alícuota y los créditos (retenciones, percepciones, saldo a favor).';
comment on column liquidacion_iibb.alicuota is 'Alícuota de la jurisdicción como fracción (0.030000 = 3%).';
