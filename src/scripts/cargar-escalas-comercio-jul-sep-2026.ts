/**
 * Carga las escalas de Comercio (CCT 130/75) de julio, agosto y septiembre
 * 2026 en todas las empresas adheridas, y borra las filas que dejó mal el
 * scrapeo.
 *
 * El job de escalas lee `estudiovilaplana.com.ar`. El 29/04/2026 esa corrida
 * escribió, en cada convenio de Comercio, una fila
 * "Julio 2026 - Marzo 2031 (absorción NR)" con el básico de junio y las sumas
 * no remunerativas en cero. Como es la de vigencia más reciente, le gana a las
 * mensuales: todas las liquidaciones de julio en adelante salieron con el
 * básico de junio. Son 714 filas en 34 empresas.
 *
 * (El PDF aclara que la absorción de los $120.000 va de diciembre 2026 a marzo
 * 2027, a $20.000 por mes. El "2031" de la etiqueta no existe en el acuerdo.)
 *
 * Los valores salen del PDF de SEOCA, leído con Gemini y verificado contra la
 * fórmula del propio acuerdo: el 5,7% se aplica sobre el básico de junio MÁS
 * las no remunerativas vigentes, en tramos no acumulativos de 1,9 / 3,8 / 5,7.
 *   (1.137.677 + 120.000) × 1,057 = 1.329.365 → básico 1.209.365 ✓
 * Los tres meses cierran al peso contra la grilla publicada.
 *
 * Septiembre queda sin `vigencia_hasta` a propósito: el acuerdo cubre hasta
 * noviembre, pero si la fila terminara el 30/11 diciembre se quedaría sin
 * escala y el básico saldría en cero. Vigente hasta que se cargue la próxima.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://..." bun src/scripts/cargar-escalas-comercio-jul-sep-2026.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
const FUENTE =
  'https://seoca.ar/wp-content/uploads/2024/02/ESCALA-SALARIAL-EMPLEADOS-DE-COMERCIO-SEOCA-2026.pdf';

if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

/** Grilla SEOCA. `noRem` de julio y agosto incluye los $25.000 extraordinarios. */
const ESCALA: { periodo: string; codigo: string; basico: number; noRem: number }[] = [
  { periodo: '2026-07', codigo: 'MA_A', basico: 1137023, noRem: 145000 },
  { periodo: '2026-07', codigo: 'MA_B', basico: 1140294, noRem: 145000 },
  { periodo: '2026-07', codigo: 'MA_C', basico: 1151751, noRem: 145000 },
  { periodo: '2026-07', codigo: 'ADM_A', basico: 1149298, noRem: 145000 },
  { periodo: '2026-07', codigo: 'ADM_B', basico: 1154212, noRem: 145000 },
  { periodo: '2026-07', codigo: 'ADM_C', basico: 1159120, noRem: 145000 },
  { periodo: '2026-07', codigo: 'ADM_D', basico: 1173854, noRem: 145000 },
  { periodo: '2026-07', codigo: 'ADM_E', basico: 1186128, noRem: 145000 },
  { periodo: '2026-07', codigo: 'ADM_F', basico: 1204135, noRem: 145000 },
  { periodo: '2026-07', codigo: 'CAJ_A', basico: 1153389, noRem: 145000 },
  { periodo: '2026-07', codigo: 'CAJ_B', basico: 1159120, noRem: 145000 },
  { periodo: '2026-07', codigo: 'CAJ_C', basico: 1166487, noRem: 145000 },
  { periodo: '2026-07', codigo: 'AUX_A', basico: 1153389, noRem: 145000 },
  { periodo: '2026-07', codigo: 'AUX_B', basico: 1161573, noRem: 145000 },
  { periodo: '2026-07', codigo: 'AUX_C', basico: 1188584, noRem: 145000 },
  { periodo: '2026-07', codigo: 'AUESP_A', basico: 1163214, noRem: 145000 },
  { periodo: '2026-07', codigo: 'AUESP_B', basico: 1177944, noRem: 145000 },
  { periodo: '2026-07', codigo: 'VEN_A', basico: 1153389, noRem: 145000 },
  { periodo: '2026-07', codigo: 'VEN_B', basico: 1177947, noRem: 145000 },
  { periodo: '2026-07', codigo: 'VEN_C', basico: 1186128, noRem: 145000 },
  { periodo: '2026-07', codigo: 'VEN_D', basico: 1204135, noRem: 145000 },
  { periodo: '2026-08', codigo: 'MA_A', basico: 1160461, noRem: 145000 },
  { periodo: '2026-08', codigo: 'MA_B', basico: 1163793, noRem: 145000 },
  { periodo: '2026-08', codigo: 'MA_C', basico: 1175464, noRem: 145000 },
  { periodo: '2026-08', codigo: 'ADM_A', basico: 1172965, noRem: 145000 },
  { periodo: '2026-08', codigo: 'ADM_B', basico: 1177971, noRem: 145000 },
  { periodo: '2026-08', codigo: 'ADM_C', basico: 1182970, noRem: 145000 },
  { periodo: '2026-08', codigo: 'ADM_D', basico: 1197978, noRem: 145000 },
  { periodo: '2026-08', codigo: 'ADM_E', basico: 1210482, noRem: 145000 },
  { periodo: '2026-08', codigo: 'ADM_F', basico: 1228824, noRem: 145000 },
  { periodo: '2026-08', codigo: 'CAJ_A', basico: 1177132, noRem: 145000 },
  { periodo: '2026-08', codigo: 'CAJ_B', basico: 1182970, noRem: 145000 },
  { periodo: '2026-08', codigo: 'CAJ_C', basico: 1190474, noRem: 145000 },
  { periodo: '2026-08', codigo: 'AUX_A', basico: 1177132, noRem: 145000 },
  { periodo: '2026-08', codigo: 'AUX_B', basico: 1185469, noRem: 145000 },
  { periodo: '2026-08', codigo: 'AUX_C', basico: 1212983, noRem: 145000 },
  { periodo: '2026-08', codigo: 'AUESP_A', basico: 1187140, noRem: 145000 },
  { periodo: '2026-08', codigo: 'AUESP_B', basico: 1202145, noRem: 145000 },
  { periodo: '2026-08', codigo: 'VEN_A', basico: 1177132, noRem: 145000 },
  { periodo: '2026-08', codigo: 'VEN_B', basico: 1202148, noRem: 145000 },
  { periodo: '2026-08', codigo: 'VEN_C', basico: 1210482, noRem: 145000 },
  { periodo: '2026-08', codigo: 'VEN_D', basico: 1228824, noRem: 145000 },
  { periodo: '2026-09', codigo: 'MA_A', basico: 1183900, noRem: 120000 },
  { periodo: '2026-09', codigo: 'MA_B', basico: 1187292, noRem: 120000 },
  { periodo: '2026-09', codigo: 'MA_C', basico: 1199176, noRem: 120000 },
  { periodo: '2026-09', codigo: 'ADM_A', basico: 1196632, noRem: 120000 },
  { periodo: '2026-09', codigo: 'ADM_B', basico: 1201729, noRem: 120000 },
  { periodo: '2026-09', codigo: 'ADM_C', basico: 1206821, noRem: 120000 },
  { periodo: '2026-09', codigo: 'ADM_D', basico: 1222103, noRem: 120000 },
  { periodo: '2026-09', codigo: 'ADM_E', basico: 1234836, noRem: 120000 },
  { periodo: '2026-09', codigo: 'ADM_F', basico: 1253514, noRem: 120000 },
  { periodo: '2026-09', codigo: 'CAJ_A', basico: 1200875, noRem: 120000 },
  { periodo: '2026-09', codigo: 'CAJ_B', basico: 1206821, noRem: 120000 },
  { periodo: '2026-09', codigo: 'CAJ_C', basico: 1214462, noRem: 120000 },
  { periodo: '2026-09', codigo: 'AUX_A', basico: 1200875, noRem: 120000 },
  { periodo: '2026-09', codigo: 'AUX_B', basico: 1209365, noRem: 120000 },
  { periodo: '2026-09', codigo: 'AUX_C', basico: 1237383, noRem: 120000 },
  { periodo: '2026-09', codigo: 'AUESP_A', basico: 1211067, noRem: 120000 },
  { periodo: '2026-09', codigo: 'AUESP_B', basico: 1226346, noRem: 120000 },
  { periodo: '2026-09', codigo: 'VEN_A', basico: 1200875, noRem: 120000 },
  { periodo: '2026-09', codigo: 'VEN_B', basico: 1226349, noRem: 120000 },
  { periodo: '2026-09', codigo: 'VEN_C', basico: 1234836, noRem: 120000 },
  { periodo: '2026-09', codigo: 'VEN_D', basico: 1253514, noRem: 120000 },
];

const FIN: Record<string, string | null> = {
  '2026-07': '2026-07-31',
  '2026-08': '2026-08-31',
  '2026-09': null,
};

const ETIQUETA: Record<string, string> = {
  '2026-07': 'Julio 2026',
  '2026-08': 'Agosto 2026',
  '2026-09': 'Septiembre 2026',
};

const ORG =
  process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ??
  process.env.ORG_ID;

const sql = postgres(URL, { max: 1 });

const [quien] = await sql`
  select current_user as usuario, current_database() as base,
         inet_server_addr()::text as host`;

// Con `arca_app` (o cualquier rol que no sea el dueño) RLS filtra por
// `app.org_id`: sin esto el script no ve una sola fila y reporta "0 empresas"
// en vez de fallar, que es peor.
if (quien.usuario !== 'postgres' && !ORG) {
  console.error(
    `\nConectado como ${quien.usuario}, que está bajo RLS. Pasá la organización:\n` +
      `  bun src/scripts/cargar-escalas-comercio-jul-sep-2026.ts --org=<org_id> [--apply]\n`
  );
  await sql.end();
  process.exit(1);
}
if (ORG) {
  await sql`select set_config('app.org_id', ${ORG}, false)`;
  console.log(`Organización: ${ORG}`);
}
console.log(
  `\nBase: ${quien.base} — host ${quien.host ?? 'local'} — conectado como ${quien.usuario}`
);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

/**
 * Convenios de Comercio: los que tienen las 21 categorías de la grilla. No se
 * filtra por `cct_codigo` porque algunos lo guardan con cero adelante y otros
 * sin él, y uno se llama solo "Comercio".
 */
const codigos = [...new Set(ESCALA.map((e) => e.codigo))];

/** `--empresa=<texto>` limita la corrida a las empresas cuyo nombre lo contenga. */
const EMPRESA = process.argv
  .find((a) => a.startsWith('--empresa='))
  ?.slice('--empresa='.length);
if (EMPRESA) console.log(`Filtro de empresa: "${EMPRESA}"`);

const categorias = await sql`
  select cc.id, cc.codigo, c.id as convenio_id, c.nombre as convenio,
         cl.razon_social as empresa
  from convenio_categoria cc
  join convenio c on c.id = cc.convenio_id
  join cliente cl on cl.id = c.cliente_id
  where cc.codigo = any(${codigos})
    and c.nombre ilike '%comercio%'
    ${EMPRESA ? sql`and cl.razon_social ilike ${'%' + EMPRESA + '%'}` : sql``}
  order by cl.razon_social, cc.codigo`;

const empresas = new Set(categorias.map((c) => c.empresa));
console.log(
  `Categorías alcanzadas: ${categorias.length} en ${empresas.size} empresas.`
);

const truchas = await sql`
  select count(*)::int n from escala_salarial es
  join convenio_categoria cc on cc.id = es.categoria_id
  where cc.id = any(${categorias.map((c) => c.id)})
    and es.periodo_label ilike '%absorción NR%'`;
console.log(`Filas "absorción NR" a borrar: ${truchas[0].n}`);

const porCodigo = new Map<string, (typeof categorias)[number][]>();
for (const c of categorias) {
  porCodigo.set(c.codigo, [...(porCodigo.get(c.codigo) ?? []), c]);
}

let aEscribir = 0;
for (const fila of ESCALA) {
  aEscribir += (porCodigo.get(fila.codigo) ?? []).length;
}
console.log(`Escalas a cargar (upsert): ${aEscribir}\n`);

const muestra = await sql`
  select cl.razon_social, es.vigencia_desde::text d, es.vigencia_hasta::text h,
         es.monto_basico b, es.monto_no_remunerativo nr, es.periodo_label pl
  from escala_salarial es
  join convenio_categoria cc on cc.id = es.categoria_id
  join convenio c on c.id = cc.convenio_id
  join cliente cl on cl.id = c.cliente_id
  where cc.codigo = 'AUX_B' and c.nombre ilike '%comercio%'
    and es.vigencia_desde >= '2026-06-01'
    ${EMPRESA ? sql`and cl.razon_social ilike ${'%' + EMPRESA + '%'}` : sql``}
  order by cl.razon_social, es.vigencia_desde limit 8`;
console.log('Antes (muestra, Personal Auxiliar B):');
for (const m of muestra) {
  console.log(
    `  ${m.razon_social.slice(0, 28).padEnd(28)} ${m.d} → ${m.h ?? '—'} $${m.b} NR $${m.nr} "${m.pl}"`
  );
}

if (!APPLY) {
  console.log('\nDry-run: nada se escribió. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

/*
 * Respaldo antes de borrar. Son filas mal leídas, pero se van 714 de una y el
 * estudio está usando la plataforma: si algo sale distinto de lo esperado,
 * esto alcanza para reponerlas sin depender de un backup de la base.
 */
const respaldo = await sql`
  select es.*, cc.codigo, cl.razon_social
  from escala_salarial es
  join convenio_categoria cc on cc.id = es.categoria_id
  join convenio c on c.id = cc.convenio_id
  join cliente cl on cl.id = c.cliente_id
  where es.categoria_id = any(${categorias.map((c) => c.id)})
    and (es.periodo_label ilike '%absorción NR%'
         or es.vigencia_desde >= '2026-07-01')`;
const archivo = `/tmp/escalas-comercio-respaldo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;
await Bun.write(archivo, JSON.stringify(respaldo, null, 2));
console.log(`\nRespaldo de ${respaldo.length} filas: ${archivo}`);

await sql.begin(async (tx) => {
  await tx`
    delete from escala_salarial es
    where es.categoria_id = any(${categorias.map((c) => c.id)})
      and es.periodo_label ilike '%absorción NR%'`;

  for (const fila of ESCALA) {
    const destino = porCodigo.get(fila.codigo) ?? [];
    for (const cat of destino) {
      await tx`
        insert into escala_salarial
          (categoria_id, vigencia_desde, vigencia_hasta, monto_basico,
           monto_no_remunerativo, periodo_label, fuente)
        values (${cat.id}, ${fila.periodo + '-01'}, ${FIN[fila.periodo]},
                ${fila.basico}, ${fila.noRem}, ${ETIQUETA[fila.periodo]}, ${FUENTE})
        on conflict (categoria_id, vigencia_desde) do update set
          vigencia_hasta = excluded.vigencia_hasta,
          monto_basico = excluded.monto_basico,
          monto_no_remunerativo = excluded.monto_no_remunerativo,
          periodo_label = excluded.periodo_label,
          fuente = excluded.fuente,
          updated_at = now()`;
    }
  }
});

const despues = await sql`
  select cl.razon_social, es.vigencia_desde::text d, es.vigencia_hasta::text h,
         es.monto_basico b, es.monto_no_remunerativo nr, es.periodo_label pl
  from escala_salarial es
  join convenio_categoria cc on cc.id = es.categoria_id
  join convenio c on c.id = cc.convenio_id
  join cliente cl on cl.id = c.cliente_id
  where cc.codigo = 'AUX_B' and c.nombre ilike '%comercio%'
    and es.vigencia_desde >= '2026-06-01'
    ${EMPRESA ? sql`and cl.razon_social ilike ${'%' + EMPRESA + '%'}` : sql``}
  order by cl.razon_social, es.vigencia_desde limit 8`;
console.log('\nDespués (misma muestra):');
for (const m of despues) {
  console.log(
    `  ${m.razon_social.slice(0, 28).padEnd(28)} ${m.d} → ${m.h ?? '—'} $${m.b} NR $${m.nr} "${m.pl}"`
  );
}

const quedan = await sql`
  select count(*)::int n from escala_salarial es
  join convenio_categoria cc on cc.id = es.categoria_id
  where cc.id = any(${categorias.map((c) => c.id)})
    and es.periodo_label ilike '%absorción NR%'`;
console.log(`\nFilas "absorción NR" restantes: ${quedan[0].n} (tiene que ser 0)`);

await sql.end();
