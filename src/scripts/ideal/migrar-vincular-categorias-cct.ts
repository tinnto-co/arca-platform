/**
 * Vincula las categorías de cada empresa con las del catálogo oficial del CCT.
 *
 * `convenio_categoria.cct_categoria_id` está en null en las 1838 categorías
 * cargadas, así que el join contra `cct_escala` nunca encuentra nada: la grilla
 * publicada del convenio —la que escribe el scrapeo semanal— hoy no llega a
 * ningún recibo. Es una tabla que nadie lee.
 *
 * Mientras eso siga así, el básico sale siempre de la copia por empresa, que
 * envejece sola. Es la raíz de lo de Comercio: 34 empresas liquidando con una
 * copia de abril mientras la grilla común tenía otra cosa.
 *
 * El match es por nombre normalizado dentro del mismo CCT: "Personal Auxiliar
 * B" de la empresa con "Personal Auxiliar B" del catálogo. Sin inventar nada:
 * lo que no matchea exacto queda sin vincular y se lista, para mirarlo a mano.
 *
 * Vincular no cambia ningún cálculo por sí solo: la escala propia de la empresa
 * sigue ganando salvo que la grilla tenga una vigencia más nueva. Lo que hace
 * es habilitar ese camino.
 *
 * Idempotente. Uso:
 *   bun src/scripts/ideal/migrar-vincular-categorias-cct.ts --org=<org_id> [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
const ORG =
  process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ??
  process.env.ORG_ID;

if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

/** Para comparar nombres: sin acentos, sin dobles espacios, en minúscula. */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Código de CCT comparable: "0130/75" y "130/75" son el mismo. */
const normalizarCct = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const m = /\b(\d{2,4})\/(\d{2,4})\b/.exec(raw);
  if (!m) return null;
  return `${String(parseInt(m[1], 10))}/${String(parseInt(m[2], 10)).padStart(2, '0')}`;
};

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

const oficiales = await sql`
  select id, cct_codigo, codigo, nombre from cct_categoria`;
console.log(`catálogo oficial: ${oficiales.length} categorías`);

/** cct normalizado + nombre normalizado → id oficial */
const porNombre = new Map<string, string>();
for (const o of oficiales) {
  const cct = normalizarCct(o.cct_codigo as string);
  if (!cct) continue;
  porNombre.set(`${cct}|${normalizar(o.nombre as string)}`, o.id as string);
}

const propias = await sql`
  select cc.id, cc.nombre, cc.cct_categoria_id, c.nombre as convenio, c.cct_codigo,
         cl.razon_social as empresa
  from convenio_categoria cc
  join convenio c on c.id = cc.convenio_id
  join cliente cl on cl.id = c.cliente_id`;
console.log(`categorías de empresas: ${propias.length}`);

const aVincular: { id: string; oficial: string }[] = [];
const sinMatch = new Map<string, number>();
let yaVinculadas = 0;

for (const p of propias) {
  if (p.cct_categoria_id) {
    yaVinculadas++;
    continue;
  }
  const cct = normalizarCct((p.cct_codigo ?? p.convenio) as string);
  if (!cct) {
    sinMatch.set(
      `${p.convenio} (sin código CCT)`,
      (sinMatch.get(`${p.convenio} (sin código CCT)`) ?? 0) + 1
    );
    continue;
  }
  const oficial = porNombre.get(`${cct}|${normalizar(p.nombre as string)}`);
  if (!oficial) {
    const clave = `${p.convenio} → "${p.nombre}"`;
    sinMatch.set(clave, (sinMatch.get(clave) ?? 0) + 1);
    continue;
  }
  aVincular.push({ id: p.id as string, oficial });
}

console.log(`\n  ya vinculadas    ${yaVinculadas}`);
console.log(`  a vincular       ${aVincular.length}`);
console.log(
  `  sin equivalente  ${[...sinMatch.values()].reduce((a, b) => a + b, 0)}`
);

if (sinMatch.size > 0) {
  console.log('\n  sin equivalente en el catálogo (primeras 10 variantes):');
  for (const [clave, n] of [...sinMatch.entries()].slice(0, 10)) {
    console.log(`    ${clave} · ${n} empresas`);
  }
  if (sinMatch.size > 10)
    console.log(`    …y ${sinMatch.size - 10} variantes más`);
}

if (!APPLY) {
  console.log('\nDry-run: nada se escribió. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

// Un update por categoría oficial en vez de uno por fila: son 21 viajes a la
// base en lugar de 714.
const porOficial = new Map<string, string[]>();
for (const v of aVincular) {
  porOficial.set(v.oficial, [...(porOficial.get(v.oficial) ?? []), v.id]);
}

await sql.begin(async (tx) => {
  for (const [oficial, ids] of porOficial) {
    await tx`
      update convenio_categoria
      set cct_categoria_id = ${oficial}, updated_at = now()
      where id = any(${ids}::uuid[])`;
  }
});

const [despues] = await sql`
  select count(*)::int total, count(cct_categoria_id)::int vinculadas
  from convenio_categoria`;
console.log(
  `\nVerificación: ${despues.vinculadas} de ${despues.total} categorías vinculadas\n`
);

await sql.end();
