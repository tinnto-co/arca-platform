-- ============================================================================
-- BD_IDEAL — Dominio 5: Bancos (tasks/modelo-ideal-db.md §8)
-- Depende de dominio1 (cliente, contraparte), dominio2 (comprobante, dato_fuente)
-- y dominio4 (cuenta contable).
-- Las 3 tablas de origen están en 0 filas: es diseño, no migración de datos.
-- ============================================================================

create type cuenta_bancaria_tipo as enum ('caja_ahorro', 'cuenta_corriente', 'otra');
create type movimiento_direccion as enum ('ingreso', 'egreso');
create type conciliacion_estado as enum ('sugerida', 'confirmada', 'rechazada');
create type extracto_estado as enum (
  'cargado', 'pendiente', 'procesando', 'extraido', 'error', 'confirmado', 'descartado'
);

-- ============================================================================
-- CUENTAS BANCARIAS
-- ============================================================================

create table cuenta_bancaria (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  banco text not null,
  tipo cuenta_bancaria_tipo,
  numero text,
  cbu text,
  alias text,
  moneda char(3) not null default 'ARS',
  cuenta_contable_id uuid references cuenta(id) on delete set null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, banco, numero)
);
create index idx_cuenta_bancaria_cliente on cuenta_bancaria(cliente_id);
create index idx_cuenta_bancaria_org on cuenta_bancaria(org_id);
create unique index idx_cuenta_bancaria_cbu on cuenta_bancaria(cbu) where cbu is not null;
create trigger trg_set_updated_at before update on cuenta_bancaria for each row execute function set_updated_at();

comment on table cuenta_bancaria is
  'Cuenta bancaria de un cliente. En el modelo viejo colgaba del representante (el login de AFIP), que no es el titular de la cuenta: acá cuelga del cliente, que es quien tiene el CUIT.';
comment on column cuenta_bancaria.cuenta_contable_id is
  'Cuenta del plan de cuentas donde se imputan los movimientos de esta cuenta bancaria (ej. "1.1.02.001 Banco Nación c/c"). Sin esto no se puede armar el asiento automático.';
comment on column cuenta_bancaria.cbu is 'CBU de 22 dígitos. Es único en todo el sistema bancario, por eso el índice único global.';

-- ============================================================================
-- MOVIMIENTOS
-- ============================================================================

create table movimiento_bancario (
  id uuid primary key default gen_random_uuid(),
  cuenta_bancaria_id uuid not null references cuenta_bancaria(id) on delete cascade,
  fecha date not null,
  periodo date generated always as (date_trunc('month', fecha::timestamp)::date) stored,
  direccion movimiento_direccion not null,
  importe numeric(15, 2) not null,
  descripcion text,
  saldo_posterior numeric(15, 2),
  contraparte_id uuid references contraparte(id),
  contraparte_texto text,
  id_externo text,
  datos_crudos jsonb,
  categoria text,
  categoria_fuente text check (categoria_fuente in ('sistema', 'manual')),
  excluido boolean not null default false,
  asiento_id uuid references asiento(id) on delete set null,
  no_contabilizar boolean not null default false,
  fuente dato_fuente not null default 'import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movimiento_bancario_importe_positivo check (importe > 0)
);
create index idx_movimiento_bancario_cuenta on movimiento_bancario(cuenta_bancaria_id);
create index idx_movimiento_bancario_fecha on movimiento_bancario(fecha);
create index idx_movimiento_bancario_periodo on movimiento_bancario(periodo);
create index idx_movimiento_bancario_contraparte on movimiento_bancario(contraparte_id);
create index idx_movimiento_bancario_asiento on movimiento_bancario(asiento_id) where asiento_id is not null;
create unique index idx_movimiento_bancario_externo
  on movimiento_bancario(cuenta_bancaria_id, id_externo) where id_externo is not null;
create trigger trg_set_updated_at before update on movimiento_bancario for each row execute function set_updated_at();

create table saldo_bancario (
  id uuid primary key default gen_random_uuid(),
  cuenta_bancaria_id uuid not null references cuenta_bancaria(id) on delete cascade,
  periodo date not null,
  saldo_inicial numeric(15, 2) not null,
  saldo_final numeric(15, 2) not null,
  extracto_id uuid references extracto_bancario(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cuenta_bancaria_id, periodo)
);
create index idx_saldo_bancario_cuenta on saldo_bancario(cuenta_bancaria_id);
create trigger trg_set_updated_at before update on saldo_bancario for each row execute function set_updated_at();

comment on table saldo_bancario is
  'Lo que el banco dice que había al empezar y al terminar cada mes, por cuenta. Se lee del extracto al importarlo; antes se usaba solo para validar que el PDF cuadrara y se descartaba. Hace falta para dos cosas: el asiento de apertura y verificar al cierre que el saldo contable de la cuenta coincida con el del banco.';
comment on column saldo_bancario.periodo is
  'Primer día del mes. Un extracto por mes y por cuenta: si se reimporta, se pisa.';

comment on table movimiento_bancario is
  'Una línea del extracto bancario.';
comment on column movimiento_bancario.asiento_id is
  'En qué asiento quedó contabilizado. El asiento del banco agrupa un mes, un concepto y una cuenta bancaria, así que muchos movimientos apuntan al mismo: por eso la referencia vive acá y no en asiento.origen_id. Null = todavía no contabilizado.';
comment on column movimiento_bancario.no_contabilizar is
  'Marcado a mano: este movimiento ya está contabilizado por otro lado y el asiento automático tiene que ignorarlo.';
comment on column movimiento_bancario.direccion is
  'Visto desde el cliente: ingreso = entró plata a su cuenta, egreso = salió. No se usa el criterio del banco (que lo ve al revés).';
comment on column movimiento_bancario.importe is
  'Siempre positivo. El signo lo da direccion, nunca el importe.';
comment on column movimiento_bancario.saldo_posterior is
  'Saldo de la cuenta después de este movimiento, tal como lo informa el extracto. Sirve para detectar movimientos faltantes en una importación.';
comment on column movimiento_bancario.contraparte_texto is
  'La descripción de la contraparte tal cual viene del banco, sin resolver. contraparte_id se completa cuando se logra identificar el CUIT.';
comment on column movimiento_bancario.id_externo is
  'Identificador del movimiento en el banco. Es la clave de deduplicación: reimportar el mismo extracto no duplica movimientos.';
comment on column movimiento_bancario.datos_crudos is
  'Fila original del extracto (CSV/API) sin procesar. Se conserva para poder reinterpretar sin volver a pedirle el archivo al cliente.';
comment on column movimiento_bancario.categoria is
  'Agrupación del movimiento (transferencias, impuestos, comisiones, ..., varios). La asigna el clasificador por palabras clave al importar; una persona puede pisarla.';
comment on column movimiento_bancario.categoria_fuente is
  'sistema = la puso el clasificador; manual = la corrigió una persona (y el clasificador no la vuelve a tocar).';
comment on column movimiento_bancario.excluido is
  'Excluido de la comparación Banco vs Facturación (ej. transferencia entre cuentas propias). Ajuste manual del estudio; el movimiento sigue existiendo.';

-- ============================================================================
-- CONCILIACIÓN
-- ============================================================================

create table conciliacion_comprobante (
  id uuid primary key default gen_random_uuid(),
  movimiento_bancario_id uuid not null references movimiento_bancario(id) on delete cascade,
  comprobante_id uuid not null references comprobante(id) on delete cascade,
  importe_conciliado numeric(15, 2) not null,
  estado conciliacion_estado not null default 'sugerida',
  fuente dato_fuente not null default 'manual',
  confianza numeric(5, 4),
  revisado_por text references "user"(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movimiento_bancario_id, comprobante_id),
  constraint conciliacion_importe_positivo check (importe_conciliado > 0)
);
create index idx_conciliacion_movimiento on conciliacion_comprobante(movimiento_bancario_id);
create index idx_conciliacion_comprobante on conciliacion_comprobante(comprobante_id);
create trigger trg_set_updated_at before update on conciliacion_comprobante for each row execute function set_updated_at();

comment on table conciliacion_comprobante is
  'Une un movimiento del banco con el comprobante que paga o cobra. Es N:N a propósito: un pago puede cancelar varias facturas y una factura puede pagarse en cuotas.';
comment on column conciliacion_comprobante.importe_conciliado is
  'Cuánto de ese movimiento se imputa a ese comprobante. Permite pagos parciales y pagos que cubren varias facturas; la suma por movimiento no debería superar su importe.';
comment on column conciliacion_comprobante.estado is
  'sugerida = la propuso el sistema o la IA y falta que un humano la mire. confirmada = validada. rechazada = se descartó (se guarda para no volver a proponerla).';
comment on column conciliacion_comprobante.confianza is
  'Puntaje 0..1 de la sugerencia automática. Null cuando la conciliación la hizo una persona.';


-- ============================================================================
-- EXTRACTOS BANCARIOS EN COLA
-- ============================================================================

create table extracto_bancario (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  documento_id uuid references documento(id) on delete set null,
  nombre_archivo text not null,
  estado extracto_estado not null default 'pendiente',
  -- Lo que leyó el modelo: banco, período y una entrada por cuenta con sus
  -- saldos y sus movimientos. Se guarda para poder revisarlo más tarde: la
  -- lectura tarda minutos y el estudio no se queda mirando la pantalla.
  extraccion jsonb,
  -- Resumen desnormalizado para la lista de la cola, y así no hay que abrir
  -- el jsonb de cada fila para pintarla.
  banco text,
  periodo_desde date,
  periodo_hasta date,
  cuentas_detectadas integer,
  movimientos_detectados integer,
  cuadra boolean,
  error text,
  intentos integer not null default 0,
  procesado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_extracto_cliente on extracto_bancario(cliente_id);
create index idx_extracto_org on extracto_bancario(org_id);
-- El worker busca lo que falta procesar por estado y orden de llegada.
create index idx_extracto_pendientes on extracto_bancario(estado, created_at)
  where estado in ('pendiente', 'procesando');
create trigger trg_set_updated_at before update on extracto_bancario for each row execute function set_updated_at();

comment on table extracto_bancario is
  'Un PDF de extracto subido, con su lectura y en qué punto de la cola está. Existe para que subir veinte extractos no obligue a esperar veinte lecturas con la pantalla abierta: se suben, se procesan en segundo plano de a varios, y se revisan cuando están.';
comment on column extracto_bancario.estado is
  'cargado = subido, todavía sin pedir la lectura (el estudio junta la tanda y aprieta Extraer). pendiente = en cola, el worker lo va a tomar. procesando = el modelo lo está leyendo. extraido = listo para que una persona lo revise. error = la lectura falló (el motivo está en `error`) y se puede reintentar. confirmado = sus movimientos ya se importaron. descartado = se decidió no importarlo.';
comment on column extracto_bancario.extraccion is
  'La lectura completa: { banco, periodoDesde, periodoHasta, cuentas: [{ numeroCuenta, cbu, tipo, moneda, saldoInicial, saldoFinal, movimientos: [...] }] }. Es la propuesta de la IA, no un dato confirmado: nada llega a movimiento_bancario sin que una persona confirme.';
comment on column extracto_bancario.cuadra is
  'Si TODAS las cuentas del extracto cierran (saldo inicial + ingresos - egresos = saldo final). Se guarda para poder ordenar la cola por lo que necesita atención.';
comment on column extracto_bancario.intentos is
  'Cuántas veces se intentó leer. Con el tope, un PDF que el modelo no puede leer no se reintenta para siempre.';
