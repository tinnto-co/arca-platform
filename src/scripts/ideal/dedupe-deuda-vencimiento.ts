/**
 * Limpia los duplicados históricos de `deuda` y `vencimiento` en BD_IDEAL y deja
 * puestos los índices únicos que impiden que vuelvan.
 *
 * El dato viejo se duplicó porque `due_date` era un timestamp naive: AFIP
 * devolvía el mismo vencimiento a distinta hora (03:00Z y 06:00Z del mismo día),
 * el dedupe del scrapper comparaba el timestamp completo y no matcheaba, así que
 * insertaba la obligación entera de nuevo. Al pasar la columna a `date` los dos
 * registros quedaron idénticos y los totales se ven al doble.
 *
 * De cada grupo sobrevive la fila más nueva: es la que tiene los importes
 * vigentes (80 de los 182 grupos tienen saldo o intereses distintos).
 *
 * Uso: bun src/scripts/ideal/dedupe-deuda-vencimiento.ts [--apply]
 */
import postgres from 'postgres';

const URL_IDEAL =
  process.env.IDEAL_DATABASE_URL ??
  'postgres://arca:arca@localhost:5460/arca_ideal';
if (!URL_IDEAL.includes('localhost') && !URL_IDEAL.includes('127.0.0.1')) {
  throw new Error('BD_IDEAL debe ser local');
}

const APLICAR = process.argv.includes('--apply');
const sql = postgres(URL_IDEAL, { max: 1 });

/** Las columnas que identifican la obligación, en el orden del índice único. */
const CLAVES = {
  deuda: [
    'credencial_id',
    'cuit',
    'establecimiento',
    'impuesto',
    'concepto',
    'sub_concepto',
    'periodo',
    'cuota',
    'vence_at',
  ],
  vencimiento: [
    'credencial_id',
    'cuit',
    'impuesto',
    'concepto',
    'sub_concepto',
    'periodo',
    'cuota',
    'vence_at',
  ],
} as const;

for (const [tabla, claves] of Object.entries(CLAVES)) {
  const cols = claves.join(', ');
  const [{ total }] = await sql.unsafe<[{ total: number }]>(
    `select count(*)::int total from ${tabla}`
  );
  // `is not distinct from` no aplica en group by: los nulls ya agrupan juntos.
  const sobrantes = await sql.unsafe<{ id: string }[]>(`
    select id from (
      select id, row_number() over (
        partition by ${cols} order by created_at desc, id
      ) rn
      from ${tabla}
    ) t where rn > 1
  `);

  console.log(`${tabla}: ${total} filas, ${sobrantes.length} duplicadas`);

  if (sobrantes.length > 0 && APLICAR) {
    await sql.unsafe(`delete from ${tabla} where id = any($1::uuid[])`, [
      sobrantes.map((s) => s.id),
    ]);
    console.log(`  borradas ${sobrantes.length}`);
  }

  if (APLICAR) {
    await sql.unsafe(`
      create unique index if not exists uq_${tabla}_obligacion
        on ${tabla} (${cols}) nulls not distinct
    `);
    console.log(`  índice uq_${tabla}_obligacion listo`);
  }
}

if (!APLICAR)
  console.log(
    '\nDry-run. Volvé a correr con --apply para borrar y crear los índices.'
  );
await sql.end();
