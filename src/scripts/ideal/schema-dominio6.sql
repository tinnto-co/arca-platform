-- ============================================================================
-- BD_IDEAL — Dominio 6: Portal / gestión (tasks/modelo-ideal-db.md §9)
-- Depende de dominio1 (cliente, credencial_afip, user) y dominio2 (notificacion).
-- Con datos reales: documento 531, notificacion_adjunto 494, alerta 207.
-- El resto (solicitud, acceso, riesgo, proyección) está en 0: es diseño.
-- ============================================================================

create type alerta_tipo as enum ('error_scraping');
create type alerta_severidad as enum ('baja', 'media', 'alta', 'critica');
create type alerta_estado as enum ('abierta', 'resuelta');
create type alerta_origen as enum ('job');

create type solicitud_tipo as enum ('documentacion', 'informacion', 'pago', 'otra');
create type solicitud_estado as enum ('abierta', 'completada', 'cancelada');

create type acceso_rol as enum ('cliente_lector');

create type riesgo_nivel as enum ('bajo', 'medio', 'alto', 'critico');

create type impuesto as enum ('iva', 'ganancias', 'ingresos_brutos', 'cargas_sociales');
create type confianza as enum ('baja', 'media', 'alta');

-- ============================================================================
-- DOCUMENTOS
-- ============================================================================

create table documento (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  credencial_id uuid not null references credencial_afip(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete set null,
  nombre text not null,
  storage_key text,
  mime_type text not null,
  tamano_bytes integer not null,
  checksum text,
  fuente dato_fuente not null default 'scraper',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_documento_credencial on documento(credencial_id);
create index idx_documento_cliente on documento(cliente_id);
create index idx_documento_org on documento(org_id);
create unique index idx_documento_storage_key on documento(storage_key) where storage_key is not null;
create trigger trg_set_updated_at before update on documento for each row execute function set_updated_at();

comment on table documento is
  'Archivo guardado en R2. La BD guarda solo la referencia (storage_key) y los metadatos; el binario nunca vive acá. Cuelga de la credencial porque los adjuntos de AFIP llegan por login; cliente_id se completa cuando se sabe de qué cliente es.';
comment on column documento.storage_key is
  'Key del objeto en R2. Null = el archivo todavía no se subió (los heredados venían en base64 dentro de la BD).';
comment on column documento.mime_type is
  'Tipo real del archivo, deducido de su contenido — no de la extensión que dijo quien lo subió.';
comment on column documento.checksum is 'SHA-256 del contenido. Sirve para detectar duplicados y verificar la subida a R2.';

create table notificacion_adjunto (
  id uuid primary key default gen_random_uuid(),
  notificacion_id uuid not null references notificacion(id) on delete cascade,
  documento_id uuid not null references documento(id) on delete cascade,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notificacion_id, documento_id)
);
create index idx_notificacion_adjunto_notificacion on notificacion_adjunto(notificacion_id);
create index idx_notificacion_adjunto_documento on notificacion_adjunto(documento_id);
create trigger trg_set_updated_at before update on notificacion_adjunto for each row execute function set_updated_at();

comment on table notificacion_adjunto is
  'Adjuntos de una notificación de AFIP. En el modelo viejo se llamaba invoice_attachment: nombre heredado que no tenía nada que ver con facturas.';

-- ============================================================================
-- ALERTAS
-- ============================================================================

create table alerta (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  credencial_id uuid references credencial_afip(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete cascade,
  tipo alerta_tipo not null,
  severidad alerta_severidad not null,
  titulo text not null,
  descripcion text,
  origen_tipo alerta_origen,
  origen_id uuid,
  estado alerta_estado not null default 'abierta',
  asignada_a text references "user"(id) on delete set null,
  resuelta_at timestamptz,
  resuelta_por text references "user"(id) on delete set null,
  detalle jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alerta_resuelta_coherente check (
    (estado = 'resuelta') or (estado <> 'resuelta' and resuelta_at is null)
  )
);
create index idx_alerta_org on alerta(org_id);
create index idx_alerta_credencial on alerta(credencial_id);
create index idx_alerta_cliente on alerta(cliente_id);
create index idx_alerta_estado on alerta(estado) where estado = 'abierta';
create index idx_alerta_origen on alerta(origen_tipo, origen_id);
create trigger trg_set_updated_at before update on alerta for each row execute function set_updated_at();

comment on table alerta is
  'Algo que el estudio tiene que mirar. Hoy son todas errores de scraping de un job; el par origen_tipo+origen_id deja apuntar a lo que la haya disparado sin sumar una columna por caso.';
comment on column alerta.origen_id is
  'Id de lo que disparó la alerta (hoy siempre un job). La FK a job se agrega en el dominio de infraestructura.';
comment on column alerta.credencial_id is
  'Login que la disparó. Las alertas de scraping son del login, no de un cliente puntual: por eso cliente_id puede quedar vacío.';
comment on column alerta.detalle is
  'Contexto de la alerta (para las de scraping: jobId, jobType, errorCategory, si es reintentable). Lo lee tanto la UI como el agente.';

-- ============================================================================
-- SOLICITUDES AL CLIENTE
-- ============================================================================

create table solicitud (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  tipo solicitud_tipo not null,
  titulo text not null,
  descripcion text,
  estado solicitud_estado not null default 'abierta',
  pedida_por text references "user"(id) on delete set null,
  vence_at timestamptz,
  completada_at timestamptz,
  detalle jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitud_completada_coherente check (
    (estado = 'completada') = (completada_at is not null)
  )
);
create index idx_solicitud_cliente on solicitud(cliente_id);
create index idx_solicitud_org on solicitud(org_id);
create index idx_solicitud_estado on solicitud(estado) where estado = 'abierta';
create trigger trg_set_updated_at before update on solicitud for each row execute function set_updated_at();

comment on table solicitud is
  'Pedido del estudio al cliente ("mandame el extracto de marzo"). Cuelga del cliente, que es a quien se le pide, no del login de AFIP.';

-- ============================================================================
-- ACCESO DEL CLIENTE AL PORTAL
-- ============================================================================

create table acceso_usuario_cliente (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  rol acceso_rol not null default 'cliente_lector',
  puede_subir_documentos boolean not null default true,
  puede_ver_deudas boolean not null default true,
  puede_ver_iva boolean not null default true,
  puede_ver_sueldos boolean not null default false,
  puede_chatear_ia boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cliente_id)
);
create index idx_acceso_usuario on acceso_usuario_cliente(user_id);
create index idx_acceso_cliente on acceso_usuario_cliente(cliente_id);
create trigger trg_set_updated_at before update on acceso_usuario_cliente for each row execute function set_updated_at();

comment on table acceso_usuario_cliente is
  'Qué cliente ve un usuario del portal y qué puede hacer. Granularidad cliente (no login de AFIP): un login puede tener varias empresas y no siempre las maneja la misma persona.';

-- ============================================================================
-- RIESGO Y PROYECCIONES
-- ============================================================================

create table riesgo_snapshot (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  score numeric(5, 2) not null,
  nivel riesgo_nivel not null,
  factores jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);
create index idx_riesgo_snapshot_cliente on riesgo_snapshot(cliente_id);
create trigger trg_set_updated_at before update on riesgo_snapshot for each row execute function set_updated_at();

comment on table riesgo_snapshot is
  'Foto del riesgo fiscal de un cliente en un período. score 0-100 y nivel derivado; factores guarda por qué dio eso, para poder explicarlo.';

create table proyeccion_impuesto (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  impuesto impuesto not null,
  monto_proyectado numeric(15, 2) not null,
  confianza confianza,
  factores jsonb,
  generada_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo, impuesto)
);
create index idx_proyeccion_cliente on proyeccion_impuesto(cliente_id);
create trigger trg_set_updated_at before update on proyeccion_impuesto for each row execute function set_updated_at();

comment on table proyeccion_impuesto is
  'Cuánto se estima que va a pagar un cliente de un impuesto en un período. factores guarda el método y las muestras usadas: una proyección sin explicación no sirve.';
