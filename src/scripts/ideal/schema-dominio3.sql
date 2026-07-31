-- ============================================================================
-- BD_IDEAL — Dominio 3: Sueldos (tasks/modelo-ideal-db.md §6)
-- Depende de schema-dominio1.sql (cliente) y schema-dominio2.sql (dato_fuente).
-- ============================================================================

create type concepto_tipo as enum ('remunerativo', 'no_remunerativo', 'descuento', 'retencion');

create type concepto_base as enum (
  'basico', 'bruto', 'total_remunerativo', 'total_no_remunerativo',
  'total_descuentos', 'neto', 'fijo', 'custom'
);

-- Columna del recibo sobre la que se aplica el porcentaje del concepto.
-- Los 'subN_M' son subtotales del rango de números SOS N..M.
create type concepto_base_columna as enum (
  'valHora', 'sueldoLegajo', 'sueldo', 'importe_fijo', 'ref_concepto',
  'sub1_9', 'sub1_19', 'sub1_26', 'sub1_39', 'sub1_199',
  'sub411_469', 'sub1_199_plus_411_469', 'sub411_414_qty',
  'os_base', 'os_norem_base', 'sac_normal', 'sac_proporcional',
  'bruto_anterior_div25', 'concepto_401_div12'
);

create type tipo_jornada as enum ('full_time', 'part_time', 'reducida');
create type sexo as enum ('masculino', 'femenino');
create type forma_pago as enum ('efectivo', 'deposito', 'transferencia', 'cheque');
-- Los 5 primeros son los únicos presentes en los datos migrados; los 4 últimos
-- ya los ofrece la app al liquidar (anticipo, comisiones, fondo de desempleo, varios).
create type recibo_tipo as enum (
  'mensual', 'quincenal', 'sac', 'liquidacion_final', 'vacaciones',
  'anticipo', 'comisiones', 'fondo_desempleo', 'otros'
);

-- ============================================================================
-- CATÁLOGOS LSD/AFIP (globales, sin dueño: los códigos los publica AFIP)
-- Forma uniforme a propósito: (codigo, nombre, codigo_sos). Un agente que
-- aprende a leer uno los lee todos.
-- ============================================================================

create table situacion_revista (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table situacion_revista is
  'Situación de revista del trabajador en el período (códigos AFIP de 2 dígitos "01".."51"). Un recibo puede declarar hasta 3 con su día de inicio.';
comment on column situacion_revista.codigo_sos is
  'Código equivalente en el sistema SOS, del que se importaron los legajos. Null = no tiene equivalencia conocida.';

create table condicion_trabajador (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table condicion_trabajador is 'Condición del trabajador para AFIP (códigos "00".."14"): jubilado, menor, etc.';

create table modalidad_contratacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table modalidad_contratacion is 'Modalidad de contratación AFIP (códigos "001".."998"): tiempo indeterminado, plazo fijo, etc.';

create table actividad (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table actividad is 'Actividad económica del trabajador según AFIP (códigos "000".."921").';

create table zona (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table zona is
  'Zona geográfica con reducción de contribuciones. El nombre incluye la vigencia y el porcentaje porque AFIP versiona la zona por período (ej. "20 - 1994/07-1995/02 - Corrientes (60 %)").';

create table provincia (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table localidad (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nacionalidad (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table siniestrado (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table siniestrado is 'Tipo de siniestro ART declarado en el período (códigos "00".."13"). "00" = no incapacitado.';

create table tipo_empresa (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column tipo_empresa.codigo is 'Código de tipo de empresa del archivo LSD (1 dígito).';

create table obra_social (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table obra_social is 'Padrón de obras sociales (RNOS). El código es el número de 6 dígitos que se declara en F931/LSD.';

-- ============================================================================
-- CONCEPTOS
-- ============================================================================

create table concepto_afip (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table concepto_afip is
  'Conceptos del Libro de Sueldos Digital: la grilla cerrada de AFIP (códigos de 6 dígitos, ej. 821000 "Otros descuentos - De uso libre"). Cada concepto propio del empleador se declara mapeado a uno de estos.';

create table concepto (
  id uuid primary key default gen_random_uuid(),
  numero smallint not null unique,
  nombre text not null,
  codigo_afip text not null references concepto_afip(codigo),
  tipo concepto_tipo,
  base_columna concepto_base_columna not null,
  pct_fijo numeric(7, 4),
  div_hs_norm integer not null default 1,
  div_cantidad integer not null default 1,
  usa_memo boolean not null default false,
  usa_cantidad boolean not null default false,
  usa_pct boolean not null default false,
  usa_concepto_ref boolean not null default false,
  usa_importe boolean not null default false,
  usa_importe_min boolean not null default false,
  usa_importe_max boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table concepto is
  'Catálogo global de conceptos de liquidación (numeración SOS 1..620). Es el vocabulario común: un cliente no inventa conceptos, habilita los de acá vía cliente_concepto.';
comment on column concepto.numero is
  'Número de concepto SOS. Define además el orden en el recibo y los subtotales (ver concepto_base_columna: sub1_199 = suma de los conceptos 1 a 199).';
comment on column concepto.base_columna is 'Sobre qué monto del recibo se calcula. importe_fijo = el valor lo carga el usuario, no se calcula.';
comment on column concepto.usa_memo is
  'Los usa_* dicen qué campos de recibo_concepto tienen sentido para este concepto — son la definición del formulario, no una validación opcional.';

create table cliente_concepto (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  concepto_id uuid not null references concepto(id) on delete cascade,
  habilitado boolean not null default true,
  codigo_propio text,
  nombre_propio text,
  concepto_afip_id uuid references concepto_afip(id),
  tipo concepto_tipo,
  base_calculo concepto_base,
  base_columna concepto_base_columna,
  formula text,
  orden integer,
  importe_min numeric(15, 2),
  importe_max numeric(15, 2),
  div_cantidad numeric(10, 4),
  div_hs_norm boolean not null default false,
  vigencia_desde date,
  vigencia_hasta date,
  repetible boolean not null default false,
  aportes_sipa boolean not null default false,
  contribuciones_sipa boolean not null default false,
  aportes_inssjyp boolean not null default false,
  contribuciones_inssjyp boolean not null default false,
  aportes_obra_social boolean not null default false,
  contribuciones_obra_social boolean not null default false,
  aportes_fsr boolean not null default false,
  contribuciones_fsr boolean not null default false,
  aportes_renatea boolean not null default false,
  contribuciones_renatea boolean not null default false,
  contribuciones_aaff boolean not null default false,
  contribuciones_fne boolean not null default false,
  contribuciones_lrt boolean not null default false,
  aportes_diferenciales boolean not null default false,
  aportes_especiales boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, concepto_id)
);
create index idx_cliente_concepto_cliente on cliente_concepto(cliente_id);
create index idx_cliente_concepto_concepto on cliente_concepto(concepto_id);
create trigger trg_set_updated_at before update on cliente_concepto for each row execute function set_updated_at();

comment on table cliente_concepto is
  'Qué conceptos usa cada cliente y cómo. Fusiona tres tablas del modelo viejo que decían lo mismo desde ángulos distintos: concepto_sos_client (habilitación), payroll_concepto (fórmula y vigencia) y lsd_perfil_concepto (código propio y bases de aporte para el LSD).';
comment on column cliente_concepto.codigo_propio is
  'Código con el que el empleador nombra el concepto en su recibo. Se declara así en el LSD; suele coincidir con concepto.numero pero no está obligado.';
comment on column cliente_concepto.formula is
  'Expresión evaluada por src/lib/payroll-formula.ts (evaluador propio, sin eval). Variables: basico, antiguedad, bruto, totalRemunerativo, neto. Null = el concepto no se calcula solo.';
comment on column cliente_concepto.aportes_sipa is
  'Los aportes_* / contribuciones_* dicen si este concepto forma la base imponible de cada subsistema. Es lo que AFIP exige declarar en el perfil LSD del empleador; de acá salen las bases del F931.';
comment on column cliente_concepto.repetible is
  'El concepto puede aparecer más de una vez en el mismo recibo (ej. varios descuentos de uso libre con memo distinto).';

-- ============================================================================
-- CONVENIOS COLECTIVOS
-- ============================================================================

create table cct (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  signatarios text,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table cct is
  'Catálogo de convenios colectivos de trabajo por número oficial (ej. "130/75" = Comercio). Global: el CCT no es de nadie, los clientes se adhieren.';

create table convenio (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  cct_codigo text references cct(codigo),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);
create index idx_convenio_cliente on convenio(cliente_id);
create trigger trg_set_updated_at before update on convenio for each row execute function set_updated_at();

comment on table convenio is
  'Adhesión de un cliente a un CCT, con sus categorías y escalas propias. Es por cliente y no global porque cada empleador arma su propia grilla de categorías sobre el mismo convenio.';
comment on column convenio.cct_codigo is
  'Null cuando el convenio no corresponde a un CCT del catálogo (ej. personal fuera de convenio).';

create table convenio_categoria (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references convenio(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  orden integer,
  es_valor_hora boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convenio_id, codigo)
);
create index idx_convenio_categoria_convenio on convenio_categoria(convenio_id);
create trigger trg_set_updated_at before update on convenio_categoria for each row execute function set_updated_at();

comment on column convenio_categoria.es_valor_hora is
  'true = la escala publica un valor hora, no un básico mensual. Cambia cómo se liquida el sueldo de esa categoría.';

create table escala_salarial (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references convenio_categoria(id) on delete cascade,
  vigencia_desde date not null,
  vigencia_hasta date,
  monto_basico numeric(15, 2) not null,
  monto_no_remunerativo numeric(15, 2) not null default 0,
  periodo_label text,
  fuente text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categoria_id, vigencia_desde)
);
create index idx_escala_categoria on escala_salarial(categoria_id);
create trigger trg_set_updated_at before update on escala_salarial for each row execute function set_updated_at();

comment on table escala_salarial is
  'Básico de convenio por categoría y vigencia. Se actualiza sola: src/lib/payroll-cron.ts corre el día 20, scrapea la fuente y parsea la escala con Gemini.';
comment on column escala_salarial.fuente is 'URL de donde salió la escala, o "MANUAL". Es la trazabilidad de un dato cargado por IA.';
comment on column escala_salarial.vigencia_hasta is 'Null = vigente hasta que aparezca una escala posterior.';

create table convenio_fuente (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references convenio(id) on delete cascade,
  fuente text not null,
  detalle text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convenio_id, fuente)
);
create index idx_convenio_fuente_convenio on convenio_fuente(convenio_id);
create trigger trg_set_updated_at before update on convenio_fuente for each row execute function set_updated_at();

comment on table convenio_fuente is 'De dónde se saca la escala de este convenio: una URL, "AFIP" (detectado del padrón de empleadores) o "MANUAL".';

create table cliente_cct (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  cct_codigo text not null,
  actividad text,
  signatarios text,
  fecha_novedad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, cct_codigo)
);
create index idx_cliente_cct_cliente on cliente_cct(cliente_id);
create trigger trg_set_updated_at before update on cliente_cct for each row execute function set_updated_at();

comment on table cliente_cct is
  'Convenios que AFIP tiene declarados para este empleador (scrapeado del padrón). Es un hecho externo: no se edita, se compara contra los convenio que el estudio cargó. "9999/99" = excluido de convenio.';
comment on column cliente_cct.fecha_novedad is 'Texto tal cual lo devuelve AFIP; no se parsea porque no siempre es una fecha válida.';

-- ============================================================================
-- EMPLEADOS Y RECIBOS
-- ============================================================================

create table empleado (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  cuil text not null,
  legajo text not null,
  nombre text not null,
  sexo sexo,
  fecha_nacimiento date,
  nacionalidad_id uuid references nacionalidad(id),
  domicilio text,
  localidad_id uuid references localidad(id),
  provincia_id uuid references provincia(id),
  codigo_postal text,
  fecha_alta date not null,
  fecha_baja date,
  activo boolean not null default true,
  convenio_id uuid references convenio(id) on delete set null,
  categoria_id uuid references convenio_categoria(id) on delete set null,
  categoria_texto text,
  tarea text,
  tipo_jornada tipo_jornada not null default 'full_time',
  horas_mensuales_normales integer not null default 0,
  dias_mensuales_normales integer not null default 0,
  valor_hora numeric(15, 2),
  valor_sueldo numeric(15, 2),
  obra_social_id uuid references obra_social(id),
  conyuge integer not null default 0,
  hijos integer not null default 0,
  forma_pago forma_pago,
  banco text,
  cbu text,
  situacion_id uuid not null references situacion_revista(id),
  condicion_id uuid not null references condicion_trabajador(id),
  actividad_id uuid not null references actividad(id),
  modalidad_contratacion_id uuid references modalidad_contratacion(id),
  siniestrado_id uuid not null references siniestrado(id),
  zona_id uuid references zona(id),
  observaciones text,
  fuente dato_fuente not null default 'import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, cuil)
);
create index idx_empleado_cliente on empleado(cliente_id);
create index idx_empleado_cuil on empleado(cuil);
create trigger trg_set_updated_at before update on empleado for each row execute function set_updated_at();

comment on table empleado is
  'Legajo del trabajador. Una sola tabla: en el modelo viejo cada código LSD estaba guardado dos veces (texto + FK) y la mitad de las columnas nunca se usó — acá queda solo la FK al catálogo.';
comment on column empleado.categoria_texto is
  'Categoría escrita a mano en el legajo importado. Convive con categoria_id: cuando el convenio todavía no está cargado en el sistema, esto es lo único que hay.';
comment on column empleado.valor_hora is 'Se usa cuando la categoría cobra por hora (convenio_categoria.es_valor_hora). Si no, manda la escala.';
comment on column empleado.valor_sueldo is 'Sueldo pactado por fuera de la escala de convenio. Null = se liquida por escala.';
comment on column empleado.conyuge is '0 o 1. Es el dato de cargas de familia que pide el LSD, no un booleano por herencia del formato.';
comment on column empleado.zona_id is 'Zona con reducción de contribuciones. Null = zona general, sin reducción.';
comment on column empleado.fuente is 'De dónde salió el legajo: import = migrado del sistema SOS del estudio.';

create table recibo (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  empleado_id uuid not null references empleado(id) on delete cascade,
  periodo date not null,
  tipo recibo_tipo not null,
  quincena smallint not null default 0,
  fecha date,
  fecha_pago date,
  lugar_pago text,
  forma_pago forma_pago,
  banco text,
  cbu text,
  basico numeric(15, 2),
  haberes numeric(15, 2) not null default 0,
  no_remunerativo numeric(15, 2) not null default 0,
  descuentos numeric(15, 2) not null default 0,
  retenciones numeric(15, 2) not null default 0,
  neto numeric(15, 2) not null default 0,
  obra_social_id uuid references obra_social(id),
  periodo_cargas date,
  fecha_deposito_cargas date,
  situacion_revista_1_id uuid references situacion_revista(id),
  situacion_revista_1_dia_inicio smallint,
  situacion_revista_2_id uuid references situacion_revista(id),
  situacion_revista_2_dia_inicio smallint,
  situacion_revista_3_id uuid references situacion_revista(id),
  situacion_revista_3_dia_inicio smallint,
  dias_trabajados integer,
  horas_trabajadas integer,
  importe_a_detraer_ley27430 numeric(15, 2),
  importe_maternidad_art13 numeric(15, 2),
  contribucion_tarea_diferencial numeric(15, 2),
  contribucion_adicional_os numeric(15, 2),
  remuneracion_4y8_override numeric(15, 2),
  remuneracion_9_override numeric(15, 2),
  observacion_recibo text,
  observacion_interna text,
  confirmado boolean not null default false,
  calculado_at timestamptz,
  fuente dato_fuente not null default 'calculo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empleado_id, periodo, tipo, quincena, fuente)
);
create index idx_recibo_cliente_periodo on recibo(cliente_id, periodo);
create index idx_recibo_empleado on recibo(empleado_id);
create trigger trg_set_updated_at before update on recibo for each row execute function set_updated_at();

comment on table recibo is
  'Liquidación de un empleado en un período. Solo se puede liquidar el mes anterior (src/lib/payroll-period-rules.ts).';
comment on column recibo.periodo is 'Primer día del mes liquidado. Fecha real, no texto: los agentes no tienen que parsear "2026-03".';
comment on column recibo.fuente is
  'calculo = lo liquidó la app, import = vino del sistema SOS. Está en la clave única porque existen los dos para el mismo período y no son el mismo recibo: hay 5 casos migrados donde el importado y el calculado difieren, y esa diferencia es justamente lo que hay que revisar.';
comment on column recibo.quincena is '0 = liquidación mensual completa. 1 o 2 = quincena, cuando el convenio paga quincenal.';
comment on column recibo.periodo_cargas is 'Período al que se imputan las cargas sociales, cuando difiere del período liquidado.';
comment on column recibo.situacion_revista_1_id is
  'AFIP admite hasta 3 situaciones de revista en el mismo mes (ej. activo del 1 al 10, licencia del 11 al 30). El día de inicio va en el campo _dia_inicio de cada una.';
comment on column recibo.importe_a_detraer_ley27430 is 'Detracción de la base de contribuciones patronales (Ley 27430 art. 4). Se declara en el F931.';
comment on column recibo.remuneracion_4y8_override is
  'Pisa el cálculo de las remuneraciones 4 y 8 del F931. Escape hatch para casos que la app no sabe liquidar; si está seteado, gana sobre el cálculo.';

create table recibo_concepto (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references recibo(id) on delete cascade,
  concepto_id uuid not null references concepto(id),
  tipo concepto_tipo,
  monto numeric(15, 2) not null,
  cantidad numeric(12, 4),
  porcentaje numeric(9, 4),
  importe numeric(15, 2),
  importe_min numeric(15, 2),
  importe_max numeric(15, 2),
  concepto_ref smallint,
  memo text,
  pct_usado numeric(9, 4),
  base_usada numeric(15, 2),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recibo_id, concepto_id, memo)
);
create index idx_recibo_concepto_recibo on recibo_concepto(recibo_id);
create index idx_recibo_concepto_concepto on recibo_concepto(concepto_id);
create trigger trg_set_updated_at before update on recibo_concepto for each row execute function set_updated_at();

comment on table recibo_concepto is
  'Línea del recibo. Apunta al concepto por FK: en el modelo viejo guardaba un código de texto suelto y el concepto_id estaba vacío en 2218 de 2233 filas.';
comment on column recibo_concepto.monto is 'Importe final que sale impreso. Los demás campos son cómo se llegó a él.';
comment on column recibo_concepto.pct_usado is
  'Porcentaje y base efectivamente aplicados al liquidar. Se guardan para poder reconstruir el cálculo aunque después cambien la fórmula o la escala.';
comment on column recibo_concepto.tipo is
  'Pisa concepto.tipo solo para este recibo (ej. un concepto que este mes se paga como no remunerativo). Null = manda el catálogo.';
comment on column recibo_concepto.concepto_ref is 'Número del concepto sobre el que se calcula, cuando concepto.base_columna = ref_concepto.';

-- ============================================================================
-- LIBRO DE SUELDOS DIGITAL Y PARÁMETROS
-- ============================================================================

create table lsd_presentacion (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  numero smallint not null default 1,
  filename text not null,
  empleados integer not null,
  conceptos integer not null,
  contenido text not null,
  generado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo, numero)
);
create index idx_lsd_presentacion_cliente on lsd_presentacion(cliente_id);
create trigger trg_set_updated_at before update on lsd_presentacion for each row execute function set_updated_at();

comment on table lsd_presentacion is
  'Archivo del Libro de Sueldos Digital generado y presentado en AFIP. Se guarda el contenido completo porque es el comprobante de lo que se declaró.';
comment on column lsd_presentacion.numero is 'Número de presentación del período: 1 = original, 2+ = rectificativas.';
comment on column lsd_presentacion.contenido is 'Archivo LSD de ancho fijo, tal cual se subió. Registros 01 (empleador), 02 (empleados), 03 (conceptos), 04 (datos del F931).';

create table parametro_periodo (
  periodo date primary key,
  tope_maximo_imponible numeric(15, 2),
  salario_minimo numeric(15, 2),
  fuente text,
  actualizado_por_cron boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_set_updated_at before update on parametro_periodo for each row execute function set_updated_at();

comment on table parametro_periodo is
  'Parámetros previsionales del mes, iguales para todo el país. Global a propósito: los publica ANSES, no dependen del cliente.';
comment on column parametro_periodo.tope_maximo_imponible is 'Tope de la base imponible para aportes (MOPRE/SIPA). Se aplica al calcular los descuentos del recibo.';
