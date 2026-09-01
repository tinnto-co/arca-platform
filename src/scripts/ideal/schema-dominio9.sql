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
-- Los desvíos de convención del original YA SE CORRIGIERON (el renombre vive en
-- `migrar-tareas-renombre.ts`, que lleva una base existente hasta esta forma):
--   · `studio_task*` → `tarea*`: castellano, singular, como el resto del modelo;
--   · `organization_id` → `org_id`, igual que las otras 34 tablas;
--   · `tipo`/`estado` como enum, no text (principio 5);
--   · `es_auto_generada` boolean → `fuente` text: el booleano no sabía decir
--     de qué se auto-generó, y agregar un tercer origen obligaba a otra columna;
--   · `asignado_a_user_id` → `asignado_a`, `periodo_mes` → `periodo`,
--     `fecha_vencimiento` → `vence_at`, `representative_id` → `cliente_id`.
--
-- Queda pendiente a propósito: `periodo` sigue text ('YYYY-MM', no es una fecha)
-- y `vence_at` sigue timestamp (debería ser date, pero el código lo lee como
-- Date y cambiarlo es una migración aparte).
-- ============================================================================

do $$ begin
  create type tarea_tipo as enum ('iva', 'iibb', 'ddjj', 'sueldos', 'convenios', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tarea_estado as enum ('pendiente', 'presentada', 'verificada');
exception when duplicate_object then null; end $$;

-- Columnas del kanban, configurables por organización. `tarea.columna_id` las
-- referencia; en null, la tarea cae en la columna que le corresponde por
-- `estado`.
create table if not exists tarea_columna (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,

  -- Nombre del color del punto que encabeza la columna, no un hex: los valores
  -- concretos salen del design system y cambian con él. Ver COLORES_COLUMNA en
  -- `src/components/tareas/utils.ts`.
  color text not null default 'neutro',

  -- Columna del sistema. Hoy sólo 'archivadas', que toda organización tiene y
  -- nadie puede renombrar, mover ni borrar: la maneja la aplicación. En una
  -- columna común es null.
  clave text,

  created_at timestamp not null default now()
);

create index if not exists ix_tarea_columna_org on tarea_columna(org_id);
-- Una sola columna de sistema por clave y organización.
create unique index if not exists uq_tarea_columna_clave
  on tarea_columna(org_id, clave) where clave is not null;

create table if not exists tarea (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  titulo text not null,
  descripcion text,
  tipo tarea_tipo not null default 'otro',
  estado tarea_estado not null default 'pendiente',
  columna_id uuid references tarea_columna(id) on delete set null,

  -- Índice fraccional: clave de TEXTO que ordena entre sus vecinas, para poder
  -- insertar una tarjeta en el medio escribiendo una sola fila.
  --
  -- `collate "C"` no es opcional: ordena por bytes. Las claves que genera
  -- `fractional-indexing` mezclan mayúsculas y minúsculas ('Zz' va antes que
  -- 'a0'), y las collations de idioma las ordenan al revés — con el agravante
  -- de que glibc y musl difieren entre sí declarando el mismo `en_US.utf8`.
  -- Sin esto el tablero sale ordenado en desarrollo y desordenado en producción.
  posicion text collate "C",

  asignado_a text references "user"(id) on delete set null,
  periodo text,
  vence_at timestamp,

  -- De dónde salió la tarea: 'manual' o el generador que la creó
  -- (ej. 'vencimiento'). Reemplaza al `es_auto_generada` booleano.
  fuente text not null default 'manual',

  -- Archivada: sale del tablero pero sigue existiendo. Es el único camino a
  -- borrarla, y por eso es una fecha y no un booleano — importa cuándo se
  -- sacó de circulación.
  archivada_at timestamp,
  archivada_por text references "user"(id) on delete set null,

  -- De dónde salió al archivarse, para poder devolverla ahí. Sin esto,
  -- desarchivar la dejaría en Archivadas, que es donde no va.
  columna_previa_id uuid references tarea_columna(id) on delete set null,

  estado_cambiado_at timestamp,
  estado_cambiado_por text references "user"(id) on delete set null,
  creado_por text references "user"(id) on delete set null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists ix_tarea_org on tarea(org_id);
-- El tablero pide siempre las no archivadas: el índice parcial cubre ese caso,
-- que es el 99% de las lecturas.
create index if not exists ix_tarea_activas on tarea(org_id)
  where archivada_at is null;
create index if not exists ix_tarea_estado on tarea(org_id, estado);
create index if not exists ix_tarea_vence on tarea(vence_at);
-- El tablero lee por columna y ordena por posición: este índice cubre las dos.
create index if not exists ix_tarea_columna_posicion on tarea(columna_id, posicion);

-- Una tarea abarca varias empresas (ej. "presentar IVA de agosto") y cada una
-- se completa por separado. De ahí el `completado` por fila.
create table if not exists tarea_cliente (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tarea(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  completado boolean not null default false,
  completado_at timestamp,
  completado_por text references "user"(id) on delete set null,

  -- De qué vencimiento salió esta fila. Es la guarda de idempotencia del
  -- generador automático (`src/lib/tareas-batch.ts`): sin ella, cada corrida
  -- del cron vuelve a crear las mismas tareas.
  vencimiento_id uuid references vencimiento(id) on delete set null
);

create unique index if not exists uq_tarea_cliente on tarea_cliente(tarea_id, cliente_id);
create index if not exists ix_tarea_cliente_cliente on tarea_cliente(cliente_id);
-- Parcial: un vencimiento se convierte en tarea una sola vez, pero las filas
-- creadas a mano no tienen vencimiento y no deben chocar entre sí.
create unique index if not exists uq_tarea_cliente_vencimiento
  on tarea_cliente(vencimiento_id) where vencimiento_id is not null;

-- Pasos de una tarea: el checklist del modal de detalle. Es la lista de cosas
-- que hay que hacer DENTRO de la tarea ("bajar el archivo", "controlar el
-- crédito fiscal"), y no tiene nada que ver con `tarea_cliente`, que dice a qué
-- empresas alcanza la obligación.
--
-- `posicion` es el mismo índice fraccional que en `tarea`, con la misma
-- collation por bytes y por la misma razón.
create table if not exists tarea_paso (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tarea(id) on delete cascade,
  titulo text not null,
  completado boolean not null default false,
  completado_at timestamp,
  completado_por text references "user"(id) on delete set null,
  posicion text collate "C",
  created_at timestamp not null default now()
);

create index if not exists ix_tarea_paso_tarea on tarea_paso(tarea_id, posicion);

-- Notificaciones que dieron origen a la tarea, o que se le fueron sumando.
--
-- N-M y no una columna en `tarea`: una notificación puede generar varias
-- tareas, y la deduplicación de las reglas hace lo inverso —cuando ya hay una
-- tarea abierta para la misma empresa y período, la notificación nueva se
-- adjunta a esa en vez de crear otra.
create table if not exists tarea_notificacion (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tarea(id) on delete cascade,
  notificacion_id uuid not null references notificacion(id) on delete cascade,

  -- 'manual' o el nombre de la regla que la vinculó.
  fuente text not null default 'manual',

  created_at timestamp not null default now()
);

create unique index if not exists uq_tarea_notificacion
  on tarea_notificacion(tarea_id, notificacion_id);
create index if not exists ix_tarea_notificacion_notificacion
  on tarea_notificacion(notificacion_id);

create table if not exists tarea_comentario (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tarea(id) on delete cascade,
  autor_id text not null references "user"(id) on delete cascade,
  contenido text not null,
  created_at timestamp not null default now(),

  -- Un comentario editado tiene que poder decirlo: en una discusión sobre una
  -- presentación, cambiar lo dicho sin dejar rastro es un problema.
  updated_at timestamp
);

create index if not exists ix_tarea_comentario_tarea on tarea_comentario(tarea_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS. `tarea` y `tarea_columna` filtran por su propia columna de organización;
-- las cuatro hijas de la tarea se alcanzan a través del padre.
-- ---------------------------------------------------------------------------
alter table tarea_columna enable row level security;
alter table tarea enable row level security;
alter table tarea_cliente enable row level security;
alter table tarea_paso enable row level security;
alter table tarea_notificacion enable row level security;
alter table tarea_comentario enable row level security;

drop policy if exists tenant on tarea_columna;
create policy tenant on tarea_columna to arca_app, arca_agent
  using (org_id = current_setting('app.org_id', true));

drop policy if exists tenant on tarea;
create policy tenant on tarea to arca_app, arca_agent
  using (org_id = current_setting('app.org_id', true));

drop policy if exists tenant on tarea_cliente;
create policy tenant on tarea_cliente to arca_app, arca_agent
  using (exists (
    select 1 from tarea t
     where t.id = tarea_cliente.tarea_id
       and t.org_id = current_setting('app.org_id', true)
  ));

drop policy if exists tenant on tarea_paso;
create policy tenant on tarea_paso to arca_app, arca_agent
  using (exists (
    select 1 from tarea t
     where t.id = tarea_paso.tarea_id
       and t.org_id = current_setting('app.org_id', true)
  ));

drop policy if exists tenant on tarea_notificacion;
create policy tenant on tarea_notificacion to arca_app, arca_agent
  using (exists (
    select 1 from tarea t
     where t.id = tarea_notificacion.tarea_id
       and t.org_id = current_setting('app.org_id', true)
  ));

drop policy if exists tenant on tarea_comentario;
create policy tenant on tarea_comentario to arca_app, arca_agent
  using (exists (
    select 1 from tarea t
     where t.id = tarea_comentario.tarea_id
       and t.org_id = current_setting('app.org_id', true)
  ));

grant select, insert, update, delete
  on tarea_columna, tarea, tarea_cliente, tarea_paso, tarea_notificacion,
     tarea_comentario
  to arca_app;
grant select
  on tarea_columna, tarea, tarea_cliente, tarea_paso, tarea_notificacion,
     tarea_comentario
  to arca_agent;
