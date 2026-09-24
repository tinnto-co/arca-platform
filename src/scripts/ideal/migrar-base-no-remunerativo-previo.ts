/**
 * Hace que los conceptos 413 y 414 se calculen solos sobre las sumas no
 * remunerativas anteriores.
 *
 * Hoy el estudio carga 411 y 412 con las sumas del acuerdo y después, para la
 * antigüedad no remunerativa, tiene que copiar el total a mano en la columna
 * importe (los $120.000 de la captura) y recién ahí poner los años y el 1%.
 * Cada mes, en cada empleado.
 *
 * Con esto el 413 y el 414 pasan a `pct_sobre_base` con una base nueva,
 * `no_remunerativo_previo`, que la grilla resuelve como la suma de las sumas no
 * remunerativas ya acumuladas: para el 413 son 411 + 412, y para el 414 esas
 * más el 413. Es el mismo encadenado que usan en SOS —413 antigüedad no rem
 * sobre los $120.000, 414 presentismo no rem sobre $153.600—: el estudio pone
 * cantidad y %, y el monto sale solo.
 *
 * No rompe la carga a mano: los dos conservan su campo importe y, cuando está
 * completo, ese valor sigue teniendo prioridad sobre la base automática.
 *
 * La fuente de verdad es `schema-dominio3.sql` (la base) y
 * `seed-conceptos-sos-catalog.ts` (el concepto), ya actualizados; esto es solo
 * para la base que ya existe.
 *
 * Idempotente. Uso:
 *   bun src/scripts/ideal/migrar-base-no-remunerativo-previo.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;

const CODIGO = 'no_remunerativo_previo';
const NOMBRE = 'No remunerativo previo (conc. 411 a 413)';
const DESCRIPCION =
  'Suma de las sumas no remunerativas cargadas antes del concepto que se ' +
  'calcula (411 + 412 + 413). Es la base de la antigüedad no remunerativa: el ' +
  'acuerdo la liquida sobre las sumas del propio acuerdo, no sobre el básico.';

if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

const sql = postgres(URL, { max: 1 });

const [quien] = await sql`
  select current_user as usuario, current_database() as base,
         inet_server_addr()::text as host`;
console.log(
  `\nBase: ${quien.base} — host ${quien.host ?? 'local'} — conectado como ${quien.usuario}`
);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

const estado = async () => {
  const [base] = await sql`
    select id from base_calculo where codigo = ${CODIGO}`;
  const conceptos = await sql`
    select c.numero, c.modo, bc.codigo as base
    from concepto c left join base_calculo bc on bc.id = c.base_calculo_id
    where c.numero in (413, 414) order by c.numero`;
  return { base, conceptos };
};

const antes = await estado();
console.log(`  base ${CODIGO}          ${antes.base ? 'ya está' : 'FALTA'}`);
for (const c of antes.conceptos) {
  console.log(
    `  concepto ${c.numero}              modo=${c.modo ?? '?'} base=${c.base ?? '—'}`
  );
}

// Overrides por cliente: si alguna empresa configuró el 414 a mano, su
// configuración pisa al catálogo y el cambio no le llega. Hay que saberlo.
const ov = await sql`
  select cl.razon_social, cc.modo, bc.codigo as base
  from cliente_concepto cc
  join concepto c on c.id = cc.concepto_id
  join cliente cl on cl.id = cc.cliente_id
  left join base_calculo bc on bc.id = cc.base_calculo_id
  where c.numero in (413, 414)
    and (cc.modo is not null or cc.base_calculo_id is not null)`;
if (ov.length > 0) {
  console.log(
    `\n  ${ov.length} empresas tienen el 413/414 configurado a mano:`
  );
  for (const o of ov) {
    console.log(
      `    ${o.razon_social}: modo=${o.modo ?? '—'} base=${o.base ?? '—'}`
    );
  }
  console.log(
    '  (su configuración sigue ganando; el cambio del catálogo no las toca)'
  );
}

if (!APPLY) {
  console.log('\nDry-run: nada se aplicó. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx`
    insert into base_calculo (codigo, nombre, descripcion)
    values (${CODIGO}, ${NOMBRE}, ${DESCRIPCION})
    on conflict (codigo) do update set
      nombre = excluded.nombre, descripcion = excluded.descripcion`;

  await tx`
    update concepto set
      modo = 'pct_sobre_base',
      base_calculo_id = (select id from base_calculo where codigo = ${CODIGO}),
      updated_at = now()
    where numero in (413, 414)`;
});

const despues = await estado();
console.log('\nVerificación:');
console.log(`  base ${CODIGO}          ${despues.base ? 'ok' : 'FALTA'}`);
for (const c of despues.conceptos) {
  console.log(
    `  concepto ${c.numero}              modo=${c.modo} base=${c.base}`
  );
}
const ok =
  !!despues.base &&
  despues.conceptos.length === 2 &&
  despues.conceptos.every(
    (c) => c.modo === 'pct_sobre_base' && c.base === CODIGO
  );
console.log(ok ? '✓ Listo\n' : '✗ Algo falló\n');

await sql.end();
