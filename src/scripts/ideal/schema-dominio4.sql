-- ============================================================================
-- BD_IDEAL — Dominio 4: Contabilidad (tasks/modelo-ideal-db.md §7)
-- Depende de schema-dominio1.sql (cliente) y schema-dominio2.sql (dato_fuente).
-- Módulo de bajo riesgo: hoy solo el plan de cuentas tiene datos (133 filas),
-- el resto está en 0. Se renombra y se tipa el origen del asiento, sin rediseñar.
-- ============================================================================

create type cuenta_tipo as enum ('imputable', 'grupo');
create type cuenta_alcance as enum ('base', 'propia');
create type cuenta_saldo as enum ('deudor', 'acreedor', 'ambos');

create type cuenta_rubro as enum (
  'caja_bancos', 'inversiones_temporarias', 'creditos_ventas', 'otros_creditos_cte',
  'bienes_cambio', 'otros_activos_cte', 'creditos_largo_plazo', 'bienes_uso',
  'intangibles', 'inversiones_permanentes', 'otros_activos_no_cte',
  'deudas_comerciales', 'deudas_financieras', 'deudas_sociales', 'deudas_fiscales',
  'otras_deudas_cte', 'deudas_largo_plazo', 'previsiones',
  'capital', 'aportes_irrevocables', 'primas_emision', 'reservas',
  'resultados_no_asignados', 'resultado_ejercicio',
  'ventas', 'costo_ventas', 'gastos_administracion', 'gastos_comercializacion',
  'gastos_financieros', 'otros_resultados_pos', 'otros_resultados_neg', 'impuesto_ganancias'
);

create type cuenta_funcion_gasto as enum ('administracion', 'comercializacion', 'financiero', 'otro');
create type cuenta_naturaleza_inflacion as enum ('monetaria', 'no_monetaria');
create type cuenta_flujo_efectivo as enum ('operativa', 'inversion', 'financiacion');

create type ejercicio_estado as enum ('abierto', 'en_cierre', 'cerrado');
create type periodo_estado as enum ('abierto', 'cerrado');

create type asiento_origen_tipo as enum ('manual', 'comprobante', 'recibo', 'movimiento_bancario', 'cierre', 'apertura', 'import');
create type asiento_linea_lado as enum ('debe', 'haber');

create type regla_mapeo_modulo as enum ('comprobante', 'recibo', 'movimiento_bancario');
create type regla_mapeo_tipo as enum ('default', 'condicional');
create type regla_mapeo_base as enum ('total', 'neto', 'iva', 'otros_tributos', 'valor_concepto', 'fijo');

create type eecc_estado as enum ('borrador', 'aprobado');

create type bien_uso_categoria as enum (
  'rodados', 'muebles_utiles', 'equipos_computacion', 'instalaciones',
  'inmuebles', 'maquinarias', 'otros'
);
create type bien_uso_estado as enum ('activo', 'vendido', 'baja');
create type bien_uso_metodo as enum ('lineal');
create type bien_uso_motivo_baja as enum ('venta', 'desuso', 'destruccion');

-- ============================================================================
-- PLAN DE CUENTAS
-- ============================================================================

create table cuenta (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  tipo cuenta_tipo not null,
  alcance cuenta_alcance not null default 'base',
  cliente_id uuid references cliente(id) on delete cascade,
  padre_id uuid references cuenta(id) on delete restrict,
  descripcion text,
  rubro cuenta_rubro,
  saldo_esperado cuenta_saldo,
  funcion_gasto cuenta_funcion_gasto,
  naturaleza_inflacion cuenta_naturaleza_inflacion,
  flujo_efectivo cuenta_flujo_efectivo,
  es_cuenta_sistema boolean not null default false,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, cliente_id, codigo),
  constraint cuenta_alcance_coherente check (
    (alcance = 'base' and cliente_id is null) or (alcance = 'propia' and cliente_id is not null)
  )
);
create index idx_cuenta_org on cuenta(org_id);
create index idx_cuenta_cliente on cuenta(cliente_id);
create index idx_cuenta_padre on cuenta(padre_id);
create trigger trg_set_updated_at before update on cuenta for each row execute function set_updated_at();

comment on table cuenta is
  'Plan de cuentas. alcance=base son las del estudio (sirven para todos los clientes); alcance=propia son las que un cliente agrega y solo ve él. El árbol se arma con padre_id y el código jerárquico ("1.1.01.002").';
comment on column cuenta.tipo is 'imputable = se puede usar en un asiento. grupo = solo agrupa y suma hijas.';
comment on column cuenta.rubro is
  'Rubro del balance al que expone la cuenta. De acá salen los Estados Contables: no hay que adivinar por el código.';
comment on column cuenta.saldo_esperado is 'Saldo normal de la cuenta. Un saldo invertido es señal de error de imputación, no un dato más.';
comment on column cuenta.funcion_gasto is 'Solo para cuentas de gasto: a qué función se asigna en el Estado de Resultados.';
comment on column cuenta.naturaleza_inflacion is 'monetaria = expuesta a la inflación (RECPAM). Necesaria para el ajuste por inflación (RT 6).';
comment on column cuenta.flujo_efectivo is 'Actividad del Estado de Flujo de Efectivo a la que pertenece el movimiento de esta cuenta.';
comment on column cuenta.es_cuenta_sistema is 'La crea y la usa la app (ej. cuenta puente de cierre). No se borra ni se renombra desde la UI.';

create table cliente_cuenta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  cuenta_id uuid not null references cuenta(id) on delete cascade,
  activa boolean,
  nombre_propio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, cuenta_id)
);
create index idx_cliente_cuenta_cliente on cliente_cuenta(cliente_id);
create trigger trg_set_updated_at before update on cliente_cuenta for each row execute function set_updated_at();

comment on table cliente_cuenta is
  'Ajustes de un cliente sobre una cuenta base del estudio: desactivarla o llamarla distinto. Solo existe la fila si el cliente cambió algo; si no hay fila, vale la cuenta base tal cual.';

-- ============================================================================
-- EJERCICIOS Y PERÍODOS
-- ============================================================================

create table ejercicio (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  numero integer not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  estado ejercicio_estado not null default 'abierto',
  cerrado_at timestamptz,
  cerrado_por text references "user"(id) on delete set null,
  reabierto_at timestamptz,
  reabierto_por text references "user"(id) on delete set null,
  motivo_reapertura text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, numero)
);
create index idx_ejercicio_cliente on ejercicio(cliente_id);
create trigger trg_set_updated_at before update on ejercicio for each row execute function set_updated_at();

comment on table ejercicio is
  'Ejercicio económico del cliente. No siempre es el año calendario: el mes de cierre está en cliente_eecc_config.cierre_ejercicio_mes.';
comment on column ejercicio.estado is
  'abierto = se puede imputar. en_cierre = se están armando los asientos de cierre. cerrado = no se toca más salvo reapertura explícita, que queda registrada.';

create table periodo_contable (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  ejercicio_id uuid not null references ejercicio(id) on delete cascade,
  periodo date not null,
  estado periodo_estado not null default 'abierto',
  cerrado_at timestamptz,
  cerrado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);
create index idx_periodo_ejercicio on periodo_contable(ejercicio_id);
create trigger trg_set_updated_at before update on periodo_contable for each row execute function set_updated_at();

comment on table periodo_contable is
  'Mes contable. Se cierra por separado del ejercicio: cerrar el mes congela las imputaciones de ese mes.';
comment on column periodo_contable.periodo is 'Primer día del mes. Fecha real, no el par (year, month) del modelo viejo.';

-- ============================================================================
-- ASIENTOS
-- ============================================================================

create table regla_mapeo (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  nombre text not null,
  modulo regla_mapeo_modulo not null,
  tipo regla_mapeo_tipo not null default 'default',
  condicion jsonb,
  prioridad integer not null default 100,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_regla_mapeo_cliente on regla_mapeo(cliente_id);
create trigger trg_set_updated_at before update on regla_mapeo for each row execute function set_updated_at();

comment on table regla_mapeo is
  'Cómo se convierte un comprobante, un recibo de sueldo o un movimiento bancario en asiento. Gana la regla activa de mayor prioridad cuya condición matchee; tipo=default es la que se aplica si ninguna condicional matcheó.';
comment on column regla_mapeo.condicion is
  'Filtro sobre el hecho de origen (ej. {"tipo": 1, "direccion": "recibido"}). Null en las reglas default.';

create table regla_mapeo_linea (
  id uuid primary key default gen_random_uuid(),
  regla_id uuid not null references regla_mapeo(id) on delete cascade,
  cuenta_id uuid not null references cuenta(id) on delete restrict,
  lado asiento_linea_lado not null,
  base regla_mapeo_base not null,
  importe_fijo numeric(15, 2),
  orden integer not null default 0,
  descripcion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_regla_mapeo_linea_regla on regla_mapeo_linea(regla_id);
create trigger trg_set_updated_at before update on regla_mapeo_linea for each row execute function set_updated_at();

comment on column regla_mapeo_linea.base is
  'De qué campo del hecho de origen sale el importe de esta línea (total, neto, iva…). fijo = usa importe_fijo.';

create table asiento (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  ejercicio_id uuid not null references ejercicio(id) on delete restrict,
  periodo_id uuid not null references periodo_contable(id) on delete restrict,
  numero integer not null,
  fecha date not null,
  descripcion text,
  origen_tipo asiento_origen_tipo not null default 'manual',
  origen_id uuid,
  regla_id uuid references regla_mapeo(id) on delete set null,
  anulado boolean not null default false,
  anulado_at timestamptz,
  anulado_por text references "user"(id) on delete set null,
  motivo_anulacion text,
  editado_post_generacion boolean not null default false,
  fuente dato_fuente not null default 'manual',
  creado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, ejercicio_id, numero),
  constraint asiento_origen_coherente check (
    (origen_tipo = 'manual' and origen_id is null) or
    (origen_tipo <> 'manual' and origen_id is not null)
  )
);
create index idx_asiento_cliente_fecha on asiento(cliente_id, fecha);
create index idx_asiento_periodo on asiento(periodo_id);
create index idx_asiento_origen on asiento(origen_tipo, origen_id);
create trigger trg_set_updated_at before update on asiento for each row execute function set_updated_at();

comment on table asiento is
  'Asiento del libro diario. Absorbe el mayor manual del modelo viejo (tabla movements): un movimiento cargado a mano es un asiento con origen_tipo=manual.';
comment on column asiento.origen_tipo is
  'Qué hecho generó el asiento. origen_id apunta a comprobante / recibo / movimiento_bancario según el tipo. El CHECK garantiza que manual no traiga origen_id y que el resto sí — no hay punteros sueltos como el source_id del modelo viejo.';
comment on column asiento.anulado is
  'Un asiento no se borra: se anula y queda. Es la regla contable y además el trail que necesitan los agentes.';
comment on column asiento.editado_post_generacion is
  'El asiento lo generó una regla y después alguien lo tocó a mano. Sirve para saber que regenerar la regla pisaría trabajo humano.';

create table asiento_linea (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references asiento(id) on delete cascade,
  cuenta_id uuid not null references cuenta(id) on delete restrict,
  debe numeric(15, 2) not null default 0,
  haber numeric(15, 2) not null default 0,
  descripcion text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asiento_linea_un_lado check (
    (debe = 0 and haber > 0) or (debe > 0 and haber = 0)
  )
);
create index idx_asiento_linea_asiento on asiento_linea(asiento_id);
create index idx_asiento_linea_cuenta on asiento_linea(cuenta_id);
create trigger trg_set_updated_at before update on asiento_linea for each row execute function set_updated_at();

comment on table asiento_linea is
  'Línea del asiento. cliente_id y periodo_id salen del asiento (el modelo viejo los repetía acá, y podían quedar desincronizados).';
comment on column asiento_linea.debe is
  'Una línea es del debe o del haber, nunca de las dos: lo garantiza el CHECK. La suma de debe = suma de haber la valida la app al confirmar el asiento.';

-- ============================================================================
-- ESTADOS CONTABLES
-- ============================================================================

create table firmante (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  nombre text not null,
  titulo text not null default 'Contador Público',
  universidad text,
  consejo text,
  tomo text,
  folio text,
  firma_imagen_key text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_firmante_org on firmante(org_id);
create trigger trg_set_updated_at before update on firmante for each row execute function set_updated_at();

comment on table firmante is
  'Contador que firma los Estados Contables. Son N por estudio (el modelo viejo asumía uno solo por organización); cada cliente elige el suyo en cliente_eecc_config.firmante_id.';
comment on column firmante.firma_imagen_key is
  'Key del archivo de la firma en R2. En el modelo viejo la imagen iba en base64 dentro de la columna.';

alter table cliente_eecc_config
  add constraint cliente_eecc_config_firmante_fk
  foreign key (firmante_id) references firmante(id) on delete set null;

create table eecc (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  ejercicio_id uuid not null references ejercicio(id) on delete cascade,
  estado eecc_estado not null default 'borrador',
  notas jsonb not null default '[]'::jsonb,
  aprobado_at timestamptz,
  aprobado_por text references "user"(id) on delete set null,
  pdf_key text,
  pdf_bytes integer,
  pdf_generado_at timestamptz,
  pdf_generado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, ejercicio_id)
);
create index idx_eecc_cliente on eecc(cliente_id);
create trigger trg_set_updated_at before update on eecc for each row execute function set_updated_at();

comment on table eecc is 'Estados Contables de un ejercicio. Un juego por ejercicio; aprobado = firmado y presentado, no se edita más.';
comment on column eecc.notas is 'Notas a los estados contables, como array de bloques de texto editables.';
comment on column eecc.pdf_key is 'Key del PDF en R2. El modelo viejo guardaba una URL (pdf_url).';

create table anexo_cmv (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  ejercicio_id uuid not null references ejercicio(id) on delete cascade,
  existencia_inicial numeric(15, 2) not null default 0,
  compras_gastos numeric(15, 2) not null default 0,
  existencia_final numeric(15, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, ejercicio_id)
);
create trigger trg_set_updated_at before update on anexo_cmv for each row execute function set_updated_at();

comment on table anexo_cmv is
  'Anexo de Costo de Mercaderías Vendidas: CMV = existencia inicial + compras - existencia final. Los tres datos los carga el estudio; el costo se calcula, no se guarda.';

create table bien_de_uso (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  nombre text not null,
  categoria bien_uso_categoria not null,
  cuenta_bien_id uuid not null references cuenta(id) on delete restrict,
  cuenta_amortizacion_acumulada_id uuid not null references cuenta(id) on delete restrict,
  cuenta_amortizacion_gasto_id uuid not null references cuenta(id) on delete restrict,
  fecha_alta date not null,
  valor_origen numeric(15, 2) not null,
  vida_util_anios integer not null,
  valor_residual numeric(15, 2) not null default 0,
  metodo bien_uso_metodo not null default 'lineal',
  estado bien_uso_estado not null default 'activo',
  fecha_baja date,
  motivo_baja bien_uso_motivo_baja,
  creado_por text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_bien_de_uso_cliente on bien_de_uso(cliente_id);
create trigger trg_set_updated_at before update on bien_de_uso for each row execute function set_updated_at();

comment on table bien_de_uso is
  'Bien de uso amortizable. Las 3 cuentas son las que usa el asiento de amortización: el bien, su amortización acumulada (regularizadora) y el gasto del período.';
comment on column bien_de_uso.valor_residual is 'Valor al que queda el bien al agotar la vida útil. La base amortizable es valor_origen - valor_residual.';
