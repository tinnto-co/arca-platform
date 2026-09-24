/**
 * ETL Dominio 8 (ajuste por inflación): NEW_DB (fuente, solo lectura) → BD_IDEAL.
 *
 * Sólo migra `inflation_index` → `indice_inflacion`. Las otras cuatro tablas del
 * dominio (`ajuste_inflacion`, `ajuste_inflacion_linea`,
 * `plantilla_informe_auditor`, `cierre_sueldos`) están vacías en el origen: el
 * módulo se usó poco y nada llegó a aplicarse.
 *
 * No depende de ningún otro dominio: la serie de índices es un catálogo global,
 * sin FK a cliente ni a organización. Se puede correr en cualquier orden.
 *
 * Re-ejecutable: hace upsert por (fuente, año, mes), así que no trunca nada.
 * Uso: DATABASE_URL="$MIGRATION_URL" bun src/scripts/ideal/etl-dominio8.ts
 */
import postgres from 'postgres';

const SRC_URL = process.env.DATABASE_URL;
if (!SRC_URL) throw new Error('Falta DATABASE_URL (source .env)');
if (SRC_URL.includes('5.78.132.83')) throw new Error('ORIGINAL_DB prohibida');
if (SRC_URL.includes('localhost') || SRC_URL.includes('127.0.0.1'))
  throw new Error(
    'DATABASE_URL apunta a BD_IDEAL: la fuente seria el propio destino. Correr con DATABASE_URL="$MIGRATION_URL"'
  );

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ??
  'postgres://arca:arca@localhost:5460/arca_ideal';
if (!IDEAL_URL.includes('localhost') && !IDEAL_URL.includes('127.0.0.1')) {
  throw new Error('BD_IDEAL debe ser local');
}

const src = postgres(SRC_URL, { max: 1, prepare: false });
const dst = postgres(IDEAL_URL, { max: 1 });

const [{ existe }] = await src`
  select count(*)::int existe from information_schema.tables
  where table_schema = 'public' and table_name = 'inflation_index'`;

if (!existe) {
  console.log(
    '→ La fuente no tiene inflation_index (es anterior al módulo de balances). Nada que migrar.'
  );
} else {
  const rows = await src`
    select source::text, year, month, value from inflation_index
    order by source, year, month`;
  console.log(`→ ${rows.length} índices en el origen.`);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      fuente: r.source,
      anio: r.year,
      mes: r.month,
      valor: String(r.value),
    }));
    await dst`
      insert into indice_inflacion ${dst(chunk, 'fuente', 'anio', 'mes', 'valor')}
      on conflict (fuente, anio, mes) do update set
        valor = excluded.valor, updated_at = now()`;
  }
}

const resumen = await dst`
  select fuente::text, count(*)::int n,
         min(anio * 100 + mes)::int desde, max(anio * 100 + mes)::int hasta
  from indice_inflacion group by fuente order by fuente`;
console.log('✓ indice_inflacion en BD_IDEAL:');
for (const r of resumen) {
  console.log(`   ${r.fuente}: ${r.n} meses, de ${r.desde} a ${r.hasta}`);
}
if (resumen.length === 0) console.log('   (vacía)');

await src.end();
await dst.end();
