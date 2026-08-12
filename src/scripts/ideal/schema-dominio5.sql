-- ============================================================================
-- BD_IDEAL — Dominio 5: Bancos (tasks/modelo-ideal-db.md §8)
-- Depende de dominio1 (cliente, contraparte), dominio2 (comprobante, dato_fuente)
-- y dominio4 (cuenta contable).
-- Las 3 tablas de origen están en 0 filas: es diseño, no migración de datos.
-- ============================================================================

create type cuenta_bancaria_tipo as enum ('caja_ahorro', 'cuenta_corriente', 'otra');
create type movimiento_direccion as enum ('ingreso', 'egreso');
create type conciliacion_estado as enum ('sugerida', 'confirmada', 'rechazada');

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
  fuente dato_fuente not null default 'import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movimiento_bancario_importe_positivo check (importe > 0)
);
create index idx_movimiento_bancario_cuenta on movimiento_bancario(cuenta_bancaria_id);
create index idx_movimiento_bancario_fecha on movimiento_bancario(fecha);
create index idx_movimiento_bancario_periodo on movimiento_bancario(periodo);
create index idx_movimiento_bancario_contraparte on movimiento_bancario(contraparte_id);
create unique index idx_movimiento_bancario_externo
  on movimiento_bancario(cuenta_bancaria_id, id_externo) where id_externo is not null;
create trigger trg_set_updated_at before update on movimiento_bancario for each row execute function set_updated_at();

comment on table movimiento_bancario is
  'Una línea del extracto bancario. El asiento contable NO se guarda acá: lo apunta asiento.origen_tipo = movimiento_bancario + origen_id.';
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
