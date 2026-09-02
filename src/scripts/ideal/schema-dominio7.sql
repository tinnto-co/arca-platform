-- ============================================================================
-- BD_IDEAL — Dominio 7: Agentes / IA + Infra (tasks/modelo-ideal-db.md §10 y §11)
-- Depende de dominio1 (cliente, credencial_afip, user, evento) y de los dominios
-- 2/4/5/6 para cerrar las FKs diferidas (ai_run_id, alerta.origen_id → job).
-- Convención: nombres de tabla en inglés (infra), columnas de negocio en castellano.
-- ============================================================================

create type job_type as enum (
  'iva', 'comprobantes', 'comprobantes_full', 'notificaciones', 'deuda', 'vencimientos', 'batch',
  'escalas',
  'tope_imponible',
  'monotributo'
);
create type job_status as enum ('pending', 'running', 'failed', 'finished');
create type job_log_level as enum ('debug', 'info', 'warn', 'error');

create type org_module as enum (
  'sueldos', 'banco', 'contabilidad', 'analytics', 'portal_cliente', 'ai_agent'
);

create type agent_message_role as enum ('user', 'assistant', 'system', 'tool');
create type agent_run_tipo as enum ('chat', 'alerta', 'clasificacion', 'proyeccion', 'revision');
create type agent_run_resultado as enum ('ok', 'error', 'cancelado');
create type agent_action_estado as enum ('propuesta', 'aprobada', 'rechazada', 'ejecutada');

-- ============================================================================
-- INFRA: JOBS DE SCRAPING
-- ============================================================================

create table job (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  credencial_id uuid references credencial_afip(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete set null,
  type job_type not null,
  status job_status not null default 'pending',
  params jsonb not null default '{}',
  result jsonb,
  failed_reason text,
  attempts integer not null default 0,
  progress integer not null default 0,
  bull_job_id text,
  started_at timestamptz,
  finished_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_credencial_requerida check (type in ('escalas', 'tope_imponible', 'monotributo') or credencial_id is not null)
);
create index idx_job_credencial on job(credencial_id);
create index idx_job_cliente on job(cliente_id);
create index idx_job_org on job(org_id);
create index idx_job_status on job(status) where status in ('pending', 'running');
create index idx_job_created on job(created_at desc);
create trigger trg_set_updated_at before update on job for each row execute function set_updated_at();

comment on table job is
  'Trabajo de scraping despachado al servicio externo. La unidad de scrapeo es el login de AFIP (credencial), no el cliente: un job recorre todas las empresas de ese login. cliente_id solo se completa cuando el job es de una empresa puntual.';
comment on column job.credencial_id is
  'Null solo en los jobs que no scrapean AFIP con login: ''escalas'' y ''tope_imponible'' leen páginas públicas, ''monotributo'' consulta el padrón A5 con el certificado WSAA del computador fiscal. El CHECK job_credencial_requerida lo exige para todos los demás tipos.';
comment on column job.bull_job_id is 'Id del job en BullMQ. Une esta fila con la cola real; sin esto no se puede diagnosticar un job trabado.';
comment on column job.attempts is 'Reintentos ya consumidos. Un job pending con started_at seteado es uno que BullMQ dio por colgado y reencoló.';

create table job_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete cascade,
  level job_log_level not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
create index idx_job_log_job on job_log(job_id);
create index idx_job_log_nivel on job_log(level) where level in ('warn', 'error');

comment on table job_log is
  'Bitácora de un job. Es append-only: no se actualiza, por eso no lleva updated_at.';
comment on column job_log.context is
  'Datos estructurados del evento (ej. screenshotKey del error en R2, período que se estaba procesando).';

create table organization_module (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  module org_module not null,
  enabled boolean not null default false,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, module)
);
create trigger trg_set_updated_at before update on organization_module for each row execute function set_updated_at();

comment on table organization_module is
  'Qué módulos tiene habilitados cada estudio. Si no hay fila, el módulo está apagado.';

-- ============================================================================
-- AGENTES: CONVERSACIÓN
-- ============================================================================

create table agent_conversation (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete set null,
  titulo text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_agent_conversation_org on agent_conversation(org_id);
create index idx_agent_conversation_user on agent_conversation(user_id);
create trigger trg_set_updated_at before update on agent_conversation for each row execute function set_updated_at();

comment on table agent_conversation is
  'Hilo de chat entre una persona del estudio y el agente. cliente_id se completa cuando la conversación es sobre una empresa puntual.';

create table agent_message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversation(id) on delete cascade,
  role agent_message_role not null,
  contenido text not null,
  tool_calls jsonb,
  citas jsonb,
  created_at timestamptz not null default now()
);
create index idx_agent_message_conversation on agent_message(conversation_id, created_at);

comment on table agent_message is
  'Mensaje del hilo. Append-only: un mensaje no se edita, por eso no lleva updated_at.';
comment on column agent_message.citas is
  'De dónde sacó el agente lo que dice (tabla, filas, período). Sin esto una respuesta contable no es verificable.';

-- ============================================================================
-- AGENTES: EJECUCIONES Y ACCIONES
-- ============================================================================

create table agent_run (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  conversation_id uuid references agent_conversation(id) on delete set null,
  cliente_id uuid references cliente(id) on delete set null,
  user_id text references "user"(id) on delete set null,
  tipo agent_run_tipo not null,
  modelo text,
  costo numeric(12, 6),
  resultado agent_run_resultado,
  input jsonb,
  output jsonb,
  tool_trace jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_agent_run_org on agent_run(org_id);
create index idx_agent_run_cliente on agent_run(cliente_id);
create index idx_agent_run_conversation on agent_run(conversation_id);
create trigger trg_set_updated_at before update on agent_run for each row execute function set_updated_at();

comment on table agent_run is
  'Una ejecución del agente. Es el ancla de trazabilidad: todo dato escrito por IA apunta acá con ai_run_id, así siempre se puede responder "esto lo puso quién, con qué modelo y por qué".';
comment on column agent_run.user_id is 'Null cuando la corrida la dispara un cron o una alerta, no una persona.';
comment on column agent_run.resultado is 'Null = todavía está corriendo.';
comment on column agent_run.costo is 'Costo en USD de la corrida. Se guarda por corrida para poder cortar por cliente o por tipo.';

create table agent_action (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  agent_run_id uuid not null references agent_run(id) on delete cascade,
  cliente_id uuid references cliente(id) on delete set null,
  tipo text not null,
  payload jsonb not null,
  estado agent_action_estado not null default 'propuesta',
  decidido_por text references "user"(id) on delete set null,
  decidido_at timestamptz,
  ejecutado_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_action_decision_coherente check (
    (estado = 'propuesta' and decidido_at is null) or
    (estado <> 'propuesta' and decidido_at is not null)
  ),
  constraint agent_action_ejecucion_coherente check (
    (estado = 'ejecutada') = (ejecutado_at is not null)
  )
);
create index idx_agent_action_org on agent_action(org_id);
create index idx_agent_action_cliente on agent_action(cliente_id);
create index idx_agent_action_run on agent_action(agent_run_id);
create index idx_agent_action_pendientes on agent_action(estado) where estado = 'propuesta';
create trigger trg_set_updated_at before update on agent_action for each row execute function set_updated_at();

comment on table agent_action is
  'La IA propone, un humano aprueba, recién ahí se ejecuta. El agente nunca escribe directo sobre los datos del estudio: deja una acción acá.';
comment on column agent_action.tipo is
  'Qué quiere hacer (ej. "imputar_comprobante", "crear_asiento"). Texto libre a propósito: el catálogo de acciones lo define la app, no el schema.';
comment on column agent_action.payload is 'Los datos exactos que se van a escribir si se aprueba. Es lo que el humano revisa.';

-- ============================================================================
-- FKs DIFERIDAS DE OTROS DOMINIOS
-- ============================================================================

alter table alerta
  add constraint alerta_origen_job_fk
  foreign key (origen_id) references job(id) on delete set null;

-- Todo hecho escrito por IA apunta a la corrida que lo escribió (principio AI-FIRST).
do $$
declare t text;
begin
  foreach t in array array[
    'comprobante', 'iva_declaracion', 'asiento', 'movimiento_bancario',
    'conciliacion_comprobante', 'documento', 'recibo', 'empleado'
  ] loop
    execute format('alter table %I add column ai_run_id uuid references agent_run(id) on delete set null', t);
    execute format('create index idx_%I_ai_run on %I(ai_run_id) where ai_run_id is not null', t, t);
    execute format(
      'alter table %I add constraint %I check ((fuente = ''ai'') = (ai_run_id is not null))',
      t, t || '_ai_coherente'
    );
    execute format(
      'comment on column %I.ai_run_id is %L', t,
      'Corrida del agente que escribió esta fila. Obligatorio si fuente = ai, prohibido si no.'
    );
  end loop;
end $$;
