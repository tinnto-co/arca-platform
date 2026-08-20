-- ============================================================================
-- BD_IDEAL — Dominio 9: Tareas del estudio (kanban)
--
-- Gestión interna: qué tiene que hacer el estudio para cada cliente y en qué
-- estado está. No es dato fiscal — no sale de AFIP ni va a una declaración.
--
-- ⚠️ Estas tablas nacieron escritas a mano en `drizzle/schema.ts`, que es un
-- archivo GENERADO (ver gen-schema.ts). No estaban en ningún .sql ni en
-- ninguna migración, así que no existían en ninguna base. Este archivo las
-- trae a la fuente de verdad.
--
-- Transcriptas desde la versión de `feat/brian`, que es la más completa: la que
-- llegó a `staging` perdió las FK a `user` y la tabla de columnas dinámicas.
--
-- ⚠️ Se respetan los desvíos de convención del original para no romper el
-- código que ya funciona (ver ~/Downloads/revision-modulo-tareas.md):
--   · `organization_id` en vez de `org_id` (el resto del modelo usa org_id);
--   · `tipo`/`estado` como text en vez de enum (principio 5);
--   · nombre en inglés con columnas en castellano (principio 1);
--   · `representative_id` apunta a `cliente.id` — herencia del modelo viejo;
--   · `periodo_mes` text y `fecha_vencimiento` timestamp, debiendo ser date.
-- ============================================================================

-- Columnas del kanban, configurables por organización. `studio_task.columna_id`
-- las referencia; en null, la tarea cae en la columna que le corresponde por
-- `estado`.
create table if not exists studio_task_column (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organization(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,
  created_at timestamp not null default now()
);

create index if not exists idx_studio_task_column_org
  on studio_task_column(organization_id);

create table if not exists studio_task (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organization(id) on delete cascade,
  titulo text not null,
  descripcion text,
  tipo text not null default 'otro',
  estado text not null default 'pendiente',
  columna_id uuid references studio_task_column(id) on delete set null,
  asignado_a_user_id text references "user"(id) on delete set null,
  periodo_mes text,
  fecha_vencimiento timestamp,
  es_auto_generada boolean not null default false,
  estado_changed_at timestamp,
  estado_changed_by_user_id text references "user"(id) on delete set null,
  created_by_user_id text references "user"(id) on delete set null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists ix_studio_task_org on studio_task(organization_id);
create index if not exists ix_studio_task_estado on studio_task(organization_id, estado);
create index if not exists ix_studio_task_vencimiento on studio_task(fecha_vencimiento);

-- Una tarea abarca varias empresas (ej. "presentar IVA de agosto") y cada una
-- se completa por separado. De ahí el `completado` por fila.
create table if not exists studio_task_client (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references studio_task(id) on delete cascade,
  representative_id uuid not null references cliente(id) on delete cascade,
  completado boolean not null default false,
  completado_at timestamp,
  completado_by_user_id text references "user"(id) on delete set null
);

create unique index if not exists uq_studio_task_client
  on studio_task_client(task_id, representative_id);
create index if not exists ix_studio_task_client_cliente
  on studio_task_client(representative_id);

create table if not exists studio_task_comment (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references studio_task(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  contenido text not null,
  created_at timestamp not null default now()
);

create index if not exists ix_studio_task_comment_task
  on studio_task_comment(task_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS. `studio_task` y `studio_task_column` filtran por su propia columna de
-- organización; las dos hijas de la tarea se alcanzan a través del padre.
-- ---------------------------------------------------------------------------
alter table studio_task_column enable row level security;
alter table studio_task enable row level security;
alter table studio_task_client enable row level security;
alter table studio_task_comment enable row level security;

drop policy if exists tenant on studio_task_column;
create policy tenant on studio_task_column to arca_app, arca_agent
  using (organization_id = current_setting('app.org_id', true));

drop policy if exists tenant on studio_task;
create policy tenant on studio_task to arca_app, arca_agent
  using (organization_id = current_setting('app.org_id', true));

drop policy if exists tenant on studio_task_client;
create policy tenant on studio_task_client to arca_app, arca_agent
  using (exists (
    select 1 from studio_task t
     where t.id = studio_task_client.task_id
       and t.organization_id = current_setting('app.org_id', true)
  ));

drop policy if exists tenant on studio_task_comment;
create policy tenant on studio_task_comment to arca_app, arca_agent
  using (exists (
    select 1 from studio_task t
     where t.id = studio_task_comment.task_id
       and t.organization_id = current_setting('app.org_id', true)
  ));

grant select, insert, update, delete
  on studio_task_column, studio_task, studio_task_client, studio_task_comment
  to arca_app;
grant select
  on studio_task_column, studio_task, studio_task_client, studio_task_comment
  to arca_agent;
