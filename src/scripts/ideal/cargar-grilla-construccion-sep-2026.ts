/**
 * Carga la grilla de Construcción (CCT 76/75) de septiembre 2026 en
 * `cct_escala`, la tabla compartida.
 *
 * Las 6 empresas con convenio de Construcción tienen escalas propias de marzo a
 * agosto, cada una cerrada a fin de mes. Septiembre no existe en ningún lado:
 * un recibo de septiembre sale con básico cero. El estudio confirmó que todavía
 * no liquidaron, así que llegamos antes.
 *
 * Los valores no son nuevos: el acuerdo dispone que en septiembre rigen los
 * salarios vigentes desde el 1° de agosto, y la tabla publicada coincide al
 * peso con lo que ya está cargado para agosto en las 6 empresas. Así que se
 * copian de ahí en vez de tipearlos: no hay transcripción que pueda salir mal.
 *
 * Va a `cct_escala` y no a cada empresa a propósito. Es el dato nacional —el
 * jornal de Zona A vale igual para todos los empleadores—, las categorías ya
 * quedaron vinculadas al catálogo, y con la precedencia nueva la grilla le gana
 * a la escala propia cuando es más reciente. Una fila por categoría en lugar de
 * 120 copias que envejecen cada una por su cuenta, que es lo que rompió
 * Comercio.
 *
 * Queda sin fecha de fin: rige hasta que se cargue la siguiente. Si se cortara
 * en septiembre, octubre volvería a quedar en cero.
 *
 * Idempotente por (cct_categoria_id, vigencia_desde). Uso:
 *   bun src/scripts/ideal/cargar-grilla-construccion-sep-2026.ts --org=<org_id> [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
const ORG =
  process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ??
  process.env.ORG_ID;
const CCT = '0076/75';
const DESDE = '2026-09-01';
const LABEL = 'Septiembre 2026';
const FUENTE =
  'https://www.construar.com.ar/2026/09/uocra-los-salarios-de-la-construccion-que-rigen-en-septiembre-segun-cada-zona-del-pais/';

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

// Las escalas propias viven bajo RLS: sin organización no se ve de dónde copiar.
if (quien.usuario !== 'postgres' && !ORG) {
  console.error(
    `Conectado como ${quien.usuario}, que está bajo RLS. Pasá --org=<org_id>.\n`
  );
  await sql.end();
  process.exit(1);
}
if (ORG) await sql`select set_config('app.org_id', ${ORG}, false)`;

/*
 * De dónde se copia: la escala de agosto de cada categoría del catálogo, tomada
 * de lo que las empresas tienen cargado. Se agrupa por categoría oficial y se
 * exige que todas las empresas coincidan en el monto: si dos empresas tienen
 * distinto valor para la misma categoría, no es el jornal del convenio y no
 * corresponde subirlo a la grilla compartida.
 */
const agosto = await sql`
  select cat.id as cct_categoria_id, cat.codigo, cat.nombre,
         array_agg(distinct es.monto_basico) as montos,
         array_agg(distinct es.monto_no_remunerativo) as no_rem,
         count(distinct c.cliente_id)::int as empresas
  from escala_salarial es
  join convenio_categoria cc on cc.id = es.categoria_id
  join convenio c on c.id = cc.convenio_id
  join cct_categoria cat on cat.id = cc.cct_categoria_id
  where c.cct_codigo = ${CCT} and es.vigencia_desde = '2026-08-01'
  group by cat.id, cat.codigo, cat.nombre
  order by cat.codigo`;

console.log(`categorías con escala de agosto: ${agosto.length} de 20`);

const listas: {
  id: string;
  codigo: string;
  nombre: string;
  basico: string;
  noRem: string;
}[] = [];
const dispares: (typeof agosto)[number][] = [];

for (const a of agosto) {
  const montos = a.montos as string[];
  const noRem = a.no_rem as string[];
  if (montos.length !== 1 || noRem.length !== 1) {
    dispares.push(a);
    continue;
  }
  listas.push({
    id: a.cct_categoria_id as string,
    codigo: a.codigo as string,
    nombre: a.nombre as string,
    basico: montos[0]!,
    noRem: noRem[0]!,
  });
}

console.log(`  con un único monto en todas las empresas: ${listas.length}`);
if (dispares.length > 0) {
  console.log(
    `  con montos distintos entre empresas (NO se cargan): ${dispares.length}`
  );
  for (const d of dispares) {
    console.log(
      `    ${d.codigo} ${d.nombre}: ${(d.montos as string[]).join(' / ')}`
    );
  }
}

const yaCargadas = await sql`
  select count(*)::int n from cct_escala e
  join cct_categoria cat on cat.id = e.cct_categoria_id
  where cat.cct_codigo = ${CCT} and e.vigencia_desde = ${DESDE}`;
console.log(`\nya en la grilla para ${DESDE}: ${yaCargadas[0].n}`);

console.log('\nlo que se va a cargar:');
for (const l of listas) {
  console.log(
    `  ${l.codigo.padEnd(6)} ${l.nombre.padEnd(38)} $${l.basico}${Number(l.noRem) > 0 ? ` + NR $${l.noRem}` : ''}`
  );
}

if (!APPLY) {
  console.log('\nDry-run: nada se escribió. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const l of listas) {
    await tx`
      insert into cct_escala
        (cct_categoria_id, vigencia_desde, vigencia_hasta, monto_basico,
         monto_no_remunerativo, periodo_label, fuente)
      values (${l.id}, ${DESDE}, null, ${l.basico}, ${l.noRem}, ${LABEL}, ${FUENTE})
      on conflict (cct_categoria_id, vigencia_desde) do update set
        vigencia_hasta = excluded.vigencia_hasta,
        monto_basico = excluded.monto_basico,
        monto_no_remunerativo = excluded.monto_no_remunerativo,
        periodo_label = excluded.periodo_label,
        fuente = excluded.fuente,
        updated_at = now()`;
  }
});

const despues = await sql`
  select cat.codigo, e.monto_basico, e.vigencia_desde::text d, e.vigencia_hasta::text h
  from cct_escala e join cct_categoria cat on cat.id = e.cct_categoria_id
  where cat.cct_codigo = ${CCT} and e.vigencia_desde = ${DESDE}
  order by cat.orden`;
console.log(
  `\nVerificación: ${despues.length} filas en la grilla para ${DESDE}`
);
for (const d of despues) {
  console.log(
    `  ${String(d.codigo).padEnd(6)} $${d.monto_basico} · ${d.d} → ${d.h ?? 'sin fin'}`
  );
}

await sql.end();
