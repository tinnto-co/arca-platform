/**
 * Lleva las tablas del kanban de los nombres viejos (`studio_task*`) a los
 * nuevos (`tarea*`), siguiendo la convención del modelo: castellano para el
 * negocio y `org_id` como columna de organización.
 *
 * Hace falta porque el código y `drizzle/schema.ts` ya usan los nombres nuevos
 * mientras que las bases que no se migraron siguen con los viejos: la app
 * falla con "Error al crear la columna" y sin rastro en el log del servidor.
 *
 * Idempotente: cada paso mira antes si ya está aplicado. Correrlo dos veces no
 * rompe nada.
 *
 * Al terminar, la base queda igual a una construida desde cero con
 * `schema-dominio9.sql` — mismos nombres de tabla, columna, tipo e índice. Eso
 * incluye renombrar los índices, que de otro modo quedarían como
 * `ix_studio_task_org` en las bases migradas y `ix_tarea_org` en las nuevas: no
 * cambia el comportamiento, pero hace que las dos dejen de ser comparables.
 *
 *   DB_URL=postgres://... bun src/scripts/ideal/migrar-tareas-renombre.ts
 *   DB_URL=postgres://... bun src/scripts/ideal/migrar-tareas-renombre.ts --apply
 */
import postgres from 'postgres';

const APLICAR = process.argv.includes('--apply');
const url = process.env.DB_URL;
if (!url) {
  console.error('Falta DB_URL.');
  process.exit(1);
}
const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });

const existe = async (tabla: string) => {
  const [r] = (await sql`
    select count(*)::int n from information_schema.tables
     where table_schema = 'public' and table_name = ${tabla}
  `) as unknown as { n: number }[];
  return r.n > 0;
};

const tieneColumna = async (tabla: string, col: string) => {
  const [r] = (await sql`
    select count(*)::int n from information_schema.columns
     where table_schema = 'public' and table_name = ${tabla} and column_name = ${col}
  `) as unknown as { n: number }[];
  return r.n > 0;
};

const tipoDeColumna = async (tabla: string, col: string) => {
  const [r] = (await sql`
    select data_type from information_schema.columns
     where table_schema = 'public' and table_name = ${tabla} and column_name = ${col}
  `) as unknown as { data_type: string }[] | [];
  return r?.data_type ?? null;
};

const existeIndice = async (nombre: string) => {
  const [r] = (await sql`
    select count(*)::int n from pg_indexes
     where schemaname = 'public' and indexname = ${nombre}
  `) as unknown as { n: number }[];
  return r.n > 0;
};

/** tabla vieja → nueva, y sus renombres de columna. */
const PLAN: [string, string, [string, string][]][] = [
  ['studio_task_column', 'tarea_columna', [['organization_id', 'org_id']]],
  [
    'studio_task',
    'tarea',
    [
      ['organization_id', 'org_id'],
      ['asignado_a_user_id', 'asignado_a'],
      ['periodo_mes', 'periodo'],
      ['fecha_vencimiento', 'vence_at'],
      ['estado_changed_at', 'estado_cambiado_at'],
      ['estado_changed_by_user_id', 'estado_cambiado_por'],
      ['created_by_user_id', 'creado_por'],
    ],
  ],
  [
    'studio_task_client',
    'tarea_cliente',
    [
      ['task_id', 'tarea_id'],
      ['representative_id', 'cliente_id'],
      ['completado_by_user_id', 'completado_por'],
    ],
  ],
  [
    'studio_task_comment',
    'tarea_comentario',
    [
      ['task_id', 'tarea_id'],
      ['user_id', 'autor_id'],
    ],
  ],
];

const pasos: string[] = [];

try {
  for (const [vieja, nueva, cols] of PLAN) {
    const hayVieja = await existe(vieja);
    const hayNueva = await existe(nueva);

    if (!hayVieja && !hayNueva) {
      console.log(`⚠ ni ${vieja} ni ${nueva} existen — ¿base sin dominio 9?`);
      continue;
    }
    if (hayVieja && hayNueva) {
      console.log(`⚠ existen LAS DOS (${vieja} y ${nueva}) — revisar a mano`);
      continue;
    }
    if (hayVieja) pasos.push(`alter table ${vieja} rename to ${nueva}`);

    // Las columnas se miran sobre la tabla que exista en este momento.
    const tabla = hayVieja ? vieja : nueva;
    for (const [de, a] of cols) {
      if (await tieneColumna(tabla, de)) {
        pasos.push(`alter table ${nueva} rename column ${de} to ${a}`);
      }
    }
  }

  // `es_auto_generada` (boolean) → `fuente` (text). El modelo usa `fuente` en
  // 14 tablas para decir de dónde salió una fila; un booleano sólo distingue
  // dos casos.
  const tablaTarea = (await existe('tarea')) ? 'tarea' : 'studio_task';
  if (await tieneColumna(tablaTarea, 'es_auto_generada')) {
    pasos.push(
      `alter table tarea add column if not exists fuente text not null default 'manual'`,
      `update tarea set fuente = case when es_auto_generada then 'scraper' else 'manual' end`,
      `alter table tarea drop column es_auto_generada`
    );
  }

  // Posición para ordenar dentro de una columna del kanban. `collate "C"`
  // obligatorio: el índice fraccional asume orden por bytes, y glibc ordena
  // distinto que musl — el mismo ORDER BY daría distinto en dev y en prod.
  if (!(await tieneColumna(tablaTarea, 'posicion'))) {
    pasos.push(`alter table tarea add column posicion text collate "C"`);
  }

  // `tipo` y `estado` como enum. `drizzle/schema.ts` ya los declara así
  // (`tareaTipo`, `tareaEstado`), pero los tipos nunca se crearon en la base:
  // los tipos de TypeScript afirmaban una garantía que Postgres no daba.
  const ENUMS: {
    col: string;
    tipoPg: string;
    valores: string[];
    porDefecto: string;
  }[] = [
    {
      col: 'tipo',
      tipoPg: 'tarea_tipo',
      valores: ['iva', 'iibb', 'ddjj', 'sueldos', 'convenios', 'otro'],
      porDefecto: 'otro',
    },
    {
      col: 'estado',
      tipoPg: 'tarea_estado',
      valores: ['pendiente', 'presentada', 'verificada'],
      porDefecto: 'pendiente',
    },
  ];
  for (const { col, tipoPg, valores, porDefecto } of ENUMS) {
    if ((await tipoDeColumna(tablaTarea, col)) !== 'USER-DEFINED') {
      const lista = valores.map((v) => `'${v}'`).join(', ');
      // El default hay que sacarlo antes: es un literal text y el ALTER TYPE no
      // sabe convertirlo.
      pasos.push(
        `do $$ begin create type ${tipoPg} as enum (${lista});
           exception when duplicate_object then null; end $$`,
        `alter table tarea alter column ${col} drop default`,
        `alter table tarea alter column ${col} type ${tipoPg} using ${col}::${tipoPg}`,
        `alter table tarea alter column ${col} set default '${porDefecto}'`
      );
    }
  }

  // `vencimiento_id` en `tarea_cliente`: es la guarda de idempotencia del
  // generador automático. Estaba declarada en `drizzle/schema.ts` pero no
  // existía en ninguna base, así que el código compilaba y `autoGenerarTareas`
  // fallaba al ejecutarse.
  if (!(await tieneColumna('tarea_cliente', 'vencimiento_id'))) {
    pasos.push(
      `alter table tarea_cliente add column vencimiento_id uuid references vencimiento(id) on delete set null`
    );
  }
  if (!(await existeIndice('uq_tarea_cliente_vencimiento'))) {
    // Parcial: un vencimiento se convierte en tarea una sola vez, pero las
    // filas cargadas a mano no tienen vencimiento y no deben chocar entre sí.
    pasos.push(
      `create unique index uq_tarea_cliente_vencimiento on tarea_cliente(vencimiento_id) where vencimiento_id is not null`
    );
  }

  // El checklist de la tarea. La tabla la crea `schema-dominio9.sql`; acá sólo
  // se avisa si falta, porque el script no construye tablas nuevas.
  if (!(await existe('tarea_paso'))) {
    console.log(
      '⚠ falta `tarea_paso` — aplicá schema-dominio9.sql a esta base'
    );
  }

  // Índice que cubre la lectura del tablero: filtra por columna y ordena por
  // posición en el mismo recorrido.
  if (!(await existeIndice('ix_tarea_columna_posicion'))) {
    pasos.push(
      `create index ix_tarea_columna_posicion on tarea(columna_id, posicion)`
    );
  }

  // Los índices heredan el nombre viejo del `rename to`.
  const RENOMBRES_INDICE: [string, string][] = [
    ['idx_studio_task_column_org', 'ix_tarea_columna_org'],
    ['ix_studio_task_org', 'ix_tarea_org'],
    ['ix_studio_task_estado', 'ix_tarea_estado'],
    ['ix_studio_task_vencimiento', 'ix_tarea_vence'],
    ['uq_studio_task_client', 'uq_tarea_cliente'],
    ['ix_studio_task_client_cliente', 'ix_tarea_cliente_cliente'],
    ['ix_studio_task_comment_task', 'ix_tarea_comentario_tarea'],
  ];
  for (const [viejo, nuevo] of RENOMBRES_INDICE) {
    if ((await existeIndice(viejo)) && !(await existeIndice(nuevo))) {
      pasos.push(`alter index ${viejo} rename to ${nuevo}`);
    }
  }

  if (!pasos.length) {
    console.log('Nada que hacer: la base ya está migrada.');
  } else {
    console.log(`${pasos.length} pasos:`);
    for (const p of pasos) console.log(`   ${p}`);
    if (!APLICAR) {
      console.log('\n(simulación — usá --apply)');
    } else {
      await sql.begin(async (tx) => {
        for (const p of pasos) await tx.unsafe(p);
      });
      console.log('\n✓ aplicado');
    }
  }
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
