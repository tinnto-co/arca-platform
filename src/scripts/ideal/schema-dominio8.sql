-- ============================================================================
-- BD_IDEAL — Dominio 8: Ajuste por inflación y cierres (port de la rama staging)
-- Depende de schema-dominio1.sql (cliente), schema-dominio3.sql (recibo) y
-- schema-dominio4.sql (cuenta, ejercicio, eecc, asiento).
--
-- El dominio 4 no se toca: su modelo está bien y ya anticipó buena parte de
-- esto — `cuenta` trae `naturaleza_inflacion`, `flujo_efectivo`, `rubro` y
-- `funcion_gasto`, y `regla_mapeo_base` trae `valor_concepto`. Acá se agrega
-- sólo lo que falta, con `alter table` explícito para que se lea qué cambia.
--
-- Equivalencias con el modelo viejo (rama staging):
--   inflation_index            → indice_inflacion
--   inflation_adjustment       → ajuste_inflacion
--   inflation_adjustment_line  → ajuste_inflacion_linea
--   audit_report_template      → plantilla_informe_auditor
--   payroll_liquidacion_cierre → cierre_sueldos
-- ============================================================================

create type indice_inflacion_fuente as enum ('facpce_rt6', 'indec_ipc', 'manual');
create type ajuste_inflacion_estado as enum ('borrador', 'aplicado');

-- El asiento del ajuste necesita su propio origen: con 'cierre' quedaría
-- indistinguible del asiento de cierre del ejercicio, y `origen_id` no podría
-- apuntar a la corrida que lo generó.
alter type asiento_origen_tipo add value if not exists 'ajuste_inflacion';

-- El motor de RT 6 distingue cuatro naturalezas, no dos: una no monetaria a
-- costo se reexpresa y una a valor corriente ya está en moneda de cierre, y los
-- resultados financieros se determinan por diferencia. `no_monetaria` queda como
-- valor heredado y el código lo lee como `no_monetaria_costo`.
alter type cuenta_naturaleza_inflacion add value if not exists 'no_monetaria_costo';
alter type cuenta_naturaleza_inflacion add value if not exists 'no_monetaria_valor_corriente';
alter type cuenta_naturaleza_inflacion add value if not exists 'resultado_por_diferencia';

-- ---------------------------------------------------------------- catálogo --
create table indice_inflacion (
  id uuid primary key default gen_random_uuid(),
  fuente indice_inflacion_fuente not null default 'facpce_rt6',
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  valor numeric(20, 6) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fuente, anio, mes)
);
create index idx_indice_inflacion_periodo on indice_inflacion(anio, mes);
create trigger trg_set_updated_at before update on indice_inflacion for each row execute function set_updated_at();

comment on table indice_inflacion is
  'Serie mensual del índice de precios usada para reexpresar (RT 6). Es un catálogo global, como los códigos de AFIP: no pertenece a ninguna organización y por eso no lleva RLS. La serie oficial la publica la FACPCE y la refresca un cron mensual.';
comment on column indice_inflacion.valor is
  'Índice del mes, no la variación. El coeficiente de reexpresión es el cociente entre el índice de cierre y el del mes de origen.';

-- ------------------------------------------------------- ajuste por inflación --
create table ajuste_inflacion (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  ejercicio_id uuid not null references ejercicio(id) on delete cascade,
  fuente indice_inflacion_fuente not null default 'facpce_rt6',
  cierre_anio integer not null,
  cierre_mes integer not null check (cierre_mes between 1 and 12),
  apertura_anio integer not null,
  apertura_mes integer not null check (apertura_mes between 1 and 12),
  estado ajuste_inflacion_estado not null default 'borrador',
  recpam numeric(20, 2) not null default 0,
  asiento_id uuid references asiento(id) on delete set null,
  aplicado_at timestamptz,
  aplicado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ejercicio_id)
);
create index idx_ajuste_inflacion_cliente on ajuste_inflacion(cliente_id);
create index idx_ajuste_inflacion_ejercicio on ajuste_inflacion(ejercicio_id);
create index idx_ajuste_inflacion_asiento on ajuste_inflacion(asiento_id);
create trigger trg_set_updated_at before update on ajuste_inflacion for each row execute function set_updated_at();

comment on table ajuste_inflacion is
  'Corrida del ajuste por inflación de un ejercicio (RT 6). Uno por ejercicio: rehacerlo pisa el anterior. borrador se puede recalcular; aplicado ya generó su asiento y no se toca.';
comment on column ajuste_inflacion.recpam is
  'Resultado por exposición a la inflación del período. Es el residuo del ajuste: la contrapartida de reexpresar las partidas no monetarias.';
comment on column ajuste_inflacion.asiento_id is
  'Asiento que materializó el ajuste. Null mientras está en borrador.';

create table ajuste_inflacion_linea (
  id uuid primary key default gen_random_uuid(),
  ajuste_id uuid not null references ajuste_inflacion(id) on delete cascade,
  cuenta_id uuid not null references cuenta(id) on delete restrict,
  anio integer,
  mes integer check (mes between 1 and 12),
  es_apertura boolean not null default false,
  historico numeric(20, 2) not null,
  coeficiente numeric(20, 6) not null,
  ajustado numeric(20, 2) not null,
  diferencia numeric(20, 2) not null,
  created_at timestamptz not null default now()
);
create index idx_ajuste_inflacion_linea_ajuste on ajuste_inflacion_linea(ajuste_id);
create index idx_ajuste_inflacion_linea_cuenta on ajuste_inflacion_linea(cuenta_id);

comment on table ajuste_inflacion_linea is
  'Detalle del ajuste, un renglón por cuenta y mes de origen. Es la traza que justifica el número: sin esto el RECPAM es un importe sin explicación.';
comment on column ajuste_inflacion_linea.anio is
  'Mes de origen de la partida, que define el coeficiente. Null en las líneas que no se estratifican por fecha.';
comment on column ajuste_inflacion_linea.es_apertura is
  'true = saldo inicial reexpresado; false = movimiento del ejercicio.';

-- ------------------------------------------------------------- auditoría --
create table plantilla_informe_auditor (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  nombre text not null,
  cuerpo text not null,
  es_default boolean not null default false,
  creado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, nombre)
);
create index idx_plantilla_informe_auditor_org on plantilla_informe_auditor(org_id);
create trigger trg_set_updated_at before update on plantilla_informe_auditor for each row execute function set_updated_at();

comment on table plantilla_informe_auditor is
  'Textos reutilizables del informe del auditor. El estudio arma su repertorio (favorable, con salvedades, abstención) y lo aplica a cada balance en vez de reescribirlo.';

-- ------------------------------------------------------ cierre de sueldos --
create table cierre_sueldos (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  asiento_id uuid references asiento(id) on delete set null,
  recibos integer not null default 0,
  conceptos_sin_regla integer not null default 0,
  cerrado_at timestamptz not null default now(),
  cerrado_por text references "user"(id) on delete set null,
  reabierto_at timestamptz,
  reabierto_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Un solo cierre VIGENTE por período; los reabiertos quedan como historial.
-- Por eso es un índice parcial y no un unique a secas: cerrar → reabrir →
-- volver a cerrar deja varias filas para el mismo (cliente, periodo).
create unique index uq_cierre_sueldos_vigente
  on cierre_sueldos(cliente_id, periodo) where reabierto_at is null;
create index idx_cierre_sueldos_cliente on cierre_sueldos(cliente_id);
create index idx_cierre_sueldos_asiento on cierre_sueldos(asiento_id);
create trigger trg_set_updated_at before update on cierre_sueldos for each row execute function set_updated_at();

comment on table cierre_sueldos is
  'Cierre contable de un período de sueldos: deja constancia de que los recibos del mes ya se asentaron. `periodo` es el primer día del mes, igual que en recibo.';
comment on column cierre_sueldos.conceptos_sin_regla is
  'Cuántos conceptos cayeron a la cuenta de pendiente de revisión. Mayor a cero significa que el asiento balancea pero hay imputaciones que el contador tiene que corregir.';

-- ============================================================================
-- Extensiones al dominio 4
-- ============================================================================

-- La norma con la que se cita el ajuste en los Estados Contables. El mecanismo
-- es el mismo en las dos —índice FACPCE, coeficientes, RECPAM—, pero un ente
-- pequeño lo aplica por la RT 54 y el resto por la RT 6, y el balance tiene que
-- invocar la que corresponde. El estudio usa RT 54 en casi todos: es el default.
create type marco_contable as enum ('rt54', 'rt6');
alter table cliente add column marco_contable marco_contable not null default 'rt54';
comment on column cliente.marco_contable is
  'Norma del ajuste por inflación que citan los EECC de esta empresa (RT 54 entes pequeños / RT 6 general).';

alter table cuenta add column cuenta_ajuste_id uuid references cuenta(id) on delete set null;
create index idx_cuenta_cuenta_ajuste on cuenta(cuenta_ajuste_id);
comment on column cuenta.cuenta_ajuste_id is
  'Cuenta contra la que se imputa la reexpresión de ésta. Permite mandar el ajuste de una no monetaria a su propia cuenta de resultados en vez de a una global.';

alter table ejercicio add column solo_referencia boolean not null default false;
alter table ejercicio add column estados_ajustados boolean not null default true;
comment on column ejercicio.solo_referencia is
  'Ejercicio cargado a mano sólo para que el siguiente tenga comparativo. No se liquida ni se cierra: es un balance transcripto.';
comment on column ejercicio.estados_ajustados is
  'Si los Estados Contables de este ejercicio se presentan reexpresados. En false el balance se emite a valores históricos y no lo dice ajustado.';

alter table eecc add column informe_auditor jsonb;
alter table eecc add column layout jsonb not null default '[]'::jsonb;
alter table eecc add column etiquetas_seccion jsonb not null default '{}'::jsonb;
comment on column eecc.informe_auditor is
  'Informe del auditor de este balance, resuelto a partir de una plantilla. Se guarda el texto final, no la referencia: la plantilla puede cambiar después.';
comment on column eecc.layout is
  'Orden de las secciones del documento, arrastrable por el usuario. Vacío = el orden por defecto.';
comment on column eecc.etiquetas_seccion is
  'Renombres de secciones y anexos elegidos por el estudio, por clave de sección.';
