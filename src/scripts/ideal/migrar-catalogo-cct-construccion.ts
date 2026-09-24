/**
 * Siembra el catálogo oficial de categorías del CCT 76/75 (Construcción).
 *
 * `cct_categoria` solo tenía las 21 de Comercio, así que para Construcción la
 * grilla publicada no tenía dónde vivir y cada empresa liquidaba con su copia
 * propia — el mismo camino que dejó a Comercio tres meses atrasado.
 *
 * Las 20 categorías salen de lo que el estudio ya tiene cargado, y se pueden
 * usar como catálogo porque son consistentes: las 6 empresas con convenio de
 * Construcción tienen exactamente los mismos códigos (A-01 a CA-05), los
 * mismos nombres y el mismo orden. No hay variantes que elegir.
 *
 * Es 4 zonas × 5 categorías: Oficial Especializado, Oficial, Medio Oficial,
 * Ayudante y Sereno, en zonas A, B, C y C Austral.
 *
 * `es_valor_hora`: el convenio publica valor hora para oficiales, medio
 * oficiales y ayudantes, y sueldo mensual para serenos. Se siembra así, que es
 * lo que dice el convenio. No cambia ningún cálculo: lo que manda en el recibo
 * es el flag de la categoría de cada empresa, y eso no se toca. Pero conviene
 * saber que 5 de las 6 empresas tienen los oficiales marcados como mensuales,
 * al revés del convenio — algo para que el estudio revise.
 *
 * Sembrar el catálogo no cambia nada por sí solo: hay que vincular las
 * categorías después (`migrar-vincular-categorias-cct.ts`) y que el scrapeo
 * tenga una fuente para este CCT (`cct_fuente`), que todavía no existe.
 *
 * Idempotente por (cct_codigo, codigo). Uso:
 *   bun src/scripts/ideal/migrar-catalogo-cct-construccion.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
const CCT = '0076/75';
/** `cct` y `cct_categoria` son globales, pero el control contra lo que usan las
 *  empresas lee `convenio`, que está bajo RLS: sin organización devuelve 0 y el
 *  control miente en vez de fallar. */
const ORG =
  process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ??
  process.env.ORG_ID;

if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

const ZONAS = [
  { prefijo: 'A', nombre: 'Zona A' },
  { prefijo: 'B', nombre: 'Zona B' },
  { prefijo: 'C', nombre: 'Zona C' },
  { prefijo: 'CA', nombre: 'Zona C Austral' },
];

/** El orden dentro de cada zona es el del convenio, de mayor a menor calificación. */
const PUESTOS = [
  { sufijo: '01', nombre: 'Oficial Especializado', valorHora: true },
  { sufijo: '02', nombre: 'Oficial', valorHora: true },
  { sufijo: '03', nombre: 'Medio Oficial', valorHora: true },
  { sufijo: '04', nombre: 'Ayudante', valorHora: true },
  { sufijo: '05', nombre: 'Sereno', valorHora: false },
];

const CATEGORIAS = ZONAS.flatMap((z, iz) =>
  PUESTOS.map((p, ip) => ({
    codigo: `${z.prefijo}-${p.sufijo}`,
    nombre: `${z.nombre} - ${p.nombre}`,
    orden: iz * PUESTOS.length + ip + 1,
    esValorHora: p.valorHora,
  }))
);

const sql = postgres(URL, { max: 1 });

const [quien] = await sql`
  select current_user as usuario, current_database() as base,
         inet_server_addr()::text as host`;
console.log(
  `\nBase: ${quien.base} — host ${quien.host ?? 'local'} — conectado como ${quien.usuario}`
);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

if (quien.usuario !== 'postgres' && !ORG) {
  console.error(
    `Conectado como ${quien.usuario}, que está bajo RLS. Pasá --org=<org_id>.\n`
  );
  await sql.end();
  process.exit(1);
}
if (ORG) await sql`select set_config('app.org_id', ${ORG}, false)`;

const [cct] = await sql`select codigo, nombre from cct where codigo = ${CCT}`;
if (!cct) {
  console.error(
    `El CCT ${CCT} no está en el catálogo \`cct\`. Nada que hacer.`
  );
  await sql.end();
  process.exit(1);
}
console.log(`CCT ${cct.codigo} — ${cct.nombre}`);

const existentes = await sql`
  select codigo, nombre from cct_categoria where cct_codigo = ${CCT}`;
console.log(
  `categorías ya en el catálogo: ${existentes.length} · a sembrar: ${CATEGORIAS.length}`
);

/* Control de que el catálogo coincida con lo que las empresas usan: si el
 * estudio tiene un código que acá no está, el vínculo lo va a dejar afuera y
 * hay que mirarlo antes, no después. */
const propias = await sql`
  select distinct cc.codigo, cc.nombre
  from convenio_categoria cc join convenio c on c.id = cc.convenio_id
  where c.cct_codigo = ${CCT}`;
const delCatalogo = new Set(CATEGORIAS.map((c) => c.codigo));
const huerfanas = propias.filter((p) => !delCatalogo.has(p.codigo as string));
console.log(
  `códigos que usan las empresas: ${propias.length} · sin equivalente en lo que se siembra: ${huerfanas.length}`
);
for (const h of huerfanas.slice(0, 10)) {
  console.log(`    ${h.codigo} · ${h.nombre}`);
}

if (!APPLY) {
  console.log('\nDry-run: nada se escribió. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const c of CATEGORIAS) {
    await tx`
      insert into cct_categoria (cct_codigo, codigo, nombre, orden, es_valor_hora)
      values (${CCT}, ${c.codigo}, ${c.nombre}, ${c.orden}, ${c.esValorHora})
      on conflict (cct_codigo, codigo) do update set
        nombre = excluded.nombre,
        orden = excluded.orden,
        es_valor_hora = excluded.es_valor_hora,
        updated_at = now()`;
  }
});

const despues = await sql`
  select codigo, nombre, orden, es_valor_hora
  from cct_categoria where cct_codigo = ${CCT} order by orden`;
console.log(`\nVerificación: ${despues.length} categorías en el catálogo`);
for (const c of despues) {
  console.log(
    `  ${String(c.codigo).padEnd(6)} ${String(c.nombre).padEnd(38)} ${c.es_valor_hora ? 'valor hora' : 'mensual'}`
  );
}

await sql.end();
