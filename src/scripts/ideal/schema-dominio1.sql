-- ============================================================================
-- BD_IDEAL — Dominio 1: Identidad fiscal (tasks/modelo-ideal-db.md §4)
-- Re-aplicable: apply-schema.ts dropea el schema public antes de correr esto.
-- Principio AI-first: COMMENT ON en todo lo no obvio — los agentes leen el
-- schema, el conocimiento vive acá y no en un prompt.
-- ============================================================================

-- ---------- trigger updated_at (mismo mecanismo que F1b) ----------
create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- enums ----------
create type tipo_persona as enum ('fisica', 'juridica');
create type condicion_iva as enum ('responsable_inscripto', 'monotributista', 'exento', 'no_alcanzado');
create type cliente_estado as enum ('activo', 'pausado', 'baja');
create type iibb_regimen as enum ('local', 'convenio_multilateral');
create type credencial_estado as enum ('activa', 'clave_invalida', 'bloqueada');
create type relacion_fuente as enum ('discovery', 'manual');
create type provincia_fuente as enum ('padron', 'nosis', 'manual');
create type documento_tipo as enum ('cuit', 'dni', 'otro');
create type evento_tipo as enum ('alta', 'cambio', 'baja', 'deteccion');
create type actor_tipo as enum ('user', 'job', 'agent');

-- ============================================================================
-- AUTH (Better Auth — copia fiel del schema actual, no se rediseña)
-- ============================================================================

create table "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  is_anonymous boolean,
  role text,
  banned boolean default false,
  ban_reason text,
  ban_expires timestamp,
  changed_password boolean
);

create table organization (
  id text primary key,
  name text not null,
  slug text unique,
  logo text,
  metadata text,
  is_active boolean not null default true,
  notes text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table account (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references "user"(id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamp,
  refresh_token_expires_at timestamp,
  scope text,
  password text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);
create index idx_account_user on account(user_id);

create table session (
  id text primary key,
  expires_at timestamp not null,
  token text not null unique,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references "user"(id) on delete cascade,
  impersonated_by text,
  active_organization_id text
);
create index idx_session_user on session(user_id);

create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamp not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table member (
  id text primary key,
  organization_id text not null references organization(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null,
  created_at timestamp not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_member_org on member(organization_id);
create index idx_member_user on member(user_id);

create table invitation (
  id text primary key,
  organization_id text not null references organization(id) on delete cascade,
  email text not null,
  role text,
  status text not null,
  inviter_id text not null references "user"(id) on delete cascade,
  expires_at timestamp not null,
  created_at timestamp not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_invitation_org on invitation(organization_id);
create index idx_invitation_inviter on invitation(inviter_id);

-- ============================================================================
-- IDENTIDAD FISCAL
-- ============================================================================

create table cliente (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cuit text not null,
  razon_social text not null,
  tipo_persona tipo_persona not null,
  condicion_iva condicion_iva,
  iibb_regimen iibb_regimen,
  estado cliente_estado not null default 'activo',
  baja_motivo text,
  baja_at timestamptz,
  email text,
  telefono text,
  domicilio text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, cuit)
);
create index idx_cliente_org on cliente(org_id);
create trigger trg_set_updated_at before update on cliente for each row execute function set_updated_at();

comment on table cliente is
  'Cliente del estudio contable (empresa o persona física con CUIT propio). Solo existe si el estudio lo dio de alta — el discovery de AFIP nunca crea clientes. Todo dato fiscal/laboral/contable cuelga de acá.';
comment on column cliente.tipo_persona is 'Derivable del prefijo de CUIT: 20/23/24/27 física, 30/33/34 jurídica.';
comment on column cliente.condicion_iva is 'Condición frente al IVA. null = sin clasificar aún.';
comment on column cliente.iibb_regimen is
  'Régimen de Ingresos Brutos. null = no liquida IIBB (habilita el módulo IIBB cuando no es null).';
comment on column cliente.estado is 'Relación comercial con el estudio (activo/pausado/baja), NO estado ante AFIP.';

create table credencial_afip (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cuit text not null,
  clave text not null,
  nombre text,
  email text,
  telefono text,
  estado credencial_estado not null default 'activa',
  ultimo_login_ok timestamptz,
  verificada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_credencial_afip_org on credencial_afip(org_id);
create trigger trg_set_updated_at before update on credencial_afip for each row execute function set_updated_at();

comment on table credencial_afip is
  'Login de AFIP (clave fiscal): un medio de acceso para scrapear, NO una entidad de negocio. La clave está cifrada AES-256-GCM. nombre/email/telefono = contacto opcional de la persona del login (sin crear un cliente fantasma).';
comment on column credencial_afip.cuit is 'CUIT que loguea en AFIP (puede o no ser también un cliente del estudio).';
comment on column credencial_afip.estado is
  'Juicio DERIVADO, no un hecho: se pasa a clave_invalida/bloqueada tras N logins fallidos seguidos, nunca por uno solo — AFIP responde "Clave o usuario incorrecto" también cuando lo que falló fue el captcha. Los hechos son ultimo_login_ok y verificada_at.';
comment on column credencial_afip.ultimo_login_ok is 'Hecho: último login exitoso en AFIP con esta clave.';
comment on column credencial_afip.verificada_at is 'Hecho: última vez que se verificó la clave explícitamente (chequeo puntual, no un scrapeo).';

create table cliente_credencial (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references cliente(id) on delete cascade,
  credencial_id uuid not null references credencial_afip(id) on delete cascade,
  fuente relacion_fuente not null default 'manual',
  afip_contribuyente_id integer,
  preferida boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, credencial_id)
);
create index idx_cliente_credencial_cliente on cliente_credencial(cliente_id);
create index idx_cliente_credencial_credencial on cliente_credencial(credencial_id);
create trigger trg_set_updated_at before update on cliente_credencial for each row execute function set_updated_at();

comment on table cliente_credencial is
  'N:M cliente ↔ credencial. Espeja las "relaciones de clave fiscal" de AFIP: con esta credencial se puede scrapear este cliente. El discovery solo puebla relaciones hacia clientes YA cargados; CUITs desconocidos van a evento (deteccion), nunca crean filas acá ni en cliente.';
comment on column cliente_credencial.afip_contribuyente_id is
  'Índice POSICIONAL de este cliente dentro de la lista de representados que ve ESA credencial en AFIP FES (Mis Comprobantes): 0, 1, 2… No es un ID estable de AFIP — el mismo valor 0 aparece en clientes distintos bajo credenciales distintas, y se invalida si cambian las delegaciones del login. Por eso vive en el vínculo y no en cliente. Es cache del discovery: si está, el scraper saltea el descubrimiento; si el selector falla, se re-descubre.';
comment on column cliente_credencial.preferida is 'Si un cliente tiene varias credenciales, cuál usa el scraper.';

create table contraparte (
  id uuid primary key default gen_random_uuid(),
  doc_tipo documento_tipo not null,
  doc_nro text not null,
  nombre text,
  provincia text,
  provincia_fuente provincia_fuente,
  provincia_actualizada_at timestamptz,
  direccion text,
  cod_postal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doc_tipo, doc_nro)
);
create trigger trg_set_updated_at before update on contraparte for each row execute function set_updated_at();

comment on table contraparte is
  'Catálogo GLOBAL (no tenant-scoped) de sujetos vistos en comprobantes: el proveedor o cliente "del otro lado" de la factura. La provincia se usa para Convenio Multilateral y se resuelve por padrón AFIP/Nosis; provincia_fuente=manual nunca se pisa automáticamente.';
comment on column contraparte.doc_tipo is
  'No siempre es CUIT: las ventas a consumidor final vienen identificadas por DNI. Por eso la clave es (doc_tipo, doc_nro) y no el CUIT solo.';

-- ---------- satélites de configuración de cliente ----------

create table cliente_empleador_config (
  cliente_id uuid primary key references cliente(id) on delete cascade,
  liquida_sueldos boolean not null default false,
  -- FKs a catálogos de sueldos: se agregan como constraints en el Dominio 3 (los catálogos aún no existen acá)
  tipo_empresa_id uuid,
  seguro_colectivo boolean not null default false,
  mipyme boolean not null default false,
  orden_cln text,
  situacion_default_id uuid,
  condicion_default_id uuid,
  actividad_default_id uuid,
  modalidad_default_id uuid,
  siniestrado_default_id uuid,
  zona_default_id uuid,
  obra_social_default_id uuid,
  firma_empleador_key text,
  plantilla_empleado_id uuid,
  usa_lsd_referencia boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_set_updated_at before update on cliente_empleador_config for each row execute function set_updated_at();

comment on table cliente_empleador_config is
  'Configuración de empleador (sueldos). Los *_default_id son los valores por defecto para nuevos empleados (códigos AFIP del Dominio 3).';
comment on column cliente_empleador_config.liquida_sueldos is
  'Habilita el módulo de sueldos para este cliente. Es explícito y no "existe la fila": hay clientes con datos de payroll históricos que hoy no liquidan.';
comment on column cliente_empleador_config.firma_empleador_key is 'Key del archivo de firma en R2 (nunca base64 en BD).';
comment on column cliente_empleador_config.orden_cln is 'Cómo se agrupan los recibos al imprimir: C = por CUIL, L = por legajo.';

create table cliente_eecc_config (
  cliente_id uuid primary key references cliente(id) on delete cascade,
  actividad_principal text,
  fecha_constitucion date,
  fecha_inscripcion_rpc date,
  numero_igj text,
  cierre_ejercicio_mes smallint,
  firmante_id uuid, -- FK a firmante (Dominio 4)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_set_updated_at before update on cliente_eecc_config for each row execute function set_updated_at();

comment on table cliente_eecc_config is
  'Membrete de Estados Contables (EECC) del cliente. Existe solo si el estudio le arma balances. firmante_id = contador que firma (tabla firmante, Dominio 4).';
comment on column cliente_eecc_config.fecha_constitucion is
  'Fecha del acta constitutiva. Distinta de fecha_inscripcion_rpc: una sociedad se constituye y se inscribe después, a veces con meses de diferencia, y la carátula y la Nota 1 piden las dos.';

-- ============================================================================
-- EVENTO (trail AI-first — se crea en D1 porque el discovery ya lo necesita)
-- ============================================================================

create table evento (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete set null,
  entidad text not null,
  entidad_id uuid,
  tipo evento_tipo not null,
  actor_tipo actor_tipo not null,
  actor_id text,
  detalle jsonb,
  at timestamptz not null default now()
);
create index idx_evento_org on evento(org_id);
create index idx_evento_cliente on evento(cliente_id);
create index idx_evento_entidad on evento(entidad, entidad_id);

comment on table evento is
  'Trail de todo lo relevante: altas, cambios, bajas y detecciones. Quién (user/job/agent via actor_tipo+actor_id), qué (entidad+entidad_id) y detalle jsonb. Es la memoria consultable de los agentes ("¿esto ya se avisó?", "¿desde cuándo pasa?"). Ej: el discovery registra tipo=deteccion con los CUITs no-cliente vistos.';
