/**
 * Verificación del paso 17 contra `contable` (remota). El RLS se prueba con
 * SET ROLE desde el superusuario: no hace falta la clave de cada rol.
 */
import postgres from 'postgres';

const CONTABLE = process.env.IDEAL_DATABASE_REMOTE!.replace(
  /\/postgres$/,
  '/contable'
);
const LOCAL_FINAL = 'postgres://arca:arca@localhost:5460/arca_ideal_final';

const r = postgres(CONTABLE, { max: 2, onnotice: () => {} });
const l = postgres(LOCAL_FINAL, { max: 2, onnotice: () => {} });

let fallos = 0;
const check = (n: string, ok: boolean, d: string) => {
  console.log(`${ok ? '✓' : '✗'} ${n}: ${d}`);
  if (!ok) fallos++;
};

// 1. tablas y políticas
const [[tl], [tr]] = await Promise.all([
  l`select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
  r`select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
]);
check('tablas', tl.c === tr.c, `local=${tl.c} contable=${tr.c}`);
const [[pl], [pr]] = await Promise.all([
  l`select count(*)::int c from pg_policies`,
  r`select count(*)::int c from pg_policies`,
]);
check('políticas RLS', pl.c === pr.c, `local=${pl.c} contable=${pr.c}`);

// 2. counts por tabla — todas
const tablas =
  await l`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`;
let difs = 0;
for (const { table_name: t } of tablas) {
  const [[a], [b]] = await Promise.all([
    l.unsafe(`select count(*)::bigint c from public."${t}"`),
    r.unsafe(`select count(*)::bigint c from public."${t}"`),
  ]);
  if (String(a.c) !== String(b.c)) {
    difs++;
    console.log(`  ✗ ${t}: local=${a.c} contable=${b.c}`);
  }
}
check(
  'counts idénticos en todas las tablas',
  difs === 0,
  difs === 0 ? `${tablas.length} tablas` : `${difs} difieren`
);

// 3. RLS con SET ROLE
async function como(
  rol: string,
  q: string,
  org?: string
): Promise<{ ok: boolean; det: string }> {
  try {
    return await r.begin(async (tx) => {
      await tx.unsafe(`set local role ${rol}`);
      if (org)
        await tx.unsafe(`select set_config('app.org_id', '${org}', true)`);
      const res = await tx.unsafe(q);
      return { ok: true, det: JSON.stringify(res[0] ?? null) };
    });
  } catch (e) {
    return { ok: false, det: (e as Error).message.split('\n')[0] };
  }
}

const sin = await como('arca_app', 'select count(*)::int c from cliente');
check('arca_app sin org → 0', sin.ok && sin.det.includes('"c":0'), sin.det);
const con = await como(
  'arca_app',
  'select count(*)::int c from cliente',
  'org_estudio_blakg'
);
const [tot] = await r`select count(*)::int c from cliente`;
check(
  'arca_app con org → todas',
  con.ok && con.det.includes(`"c":${tot.c}`),
  `${con.det} de ${tot.c}`
);
const del = await como('arca_agent', 'delete from cliente where false');
check('arca_agent no borra', !del.ok, del.det);
const scc = await como('arca_scrapper', 'select count(*) from concepto');
check('arca_scrapper sin concepto', !scc.ok, scc.det);
const scp = await como(
  'arca_scrapper',
  'select count(*)::int c from parametro_periodo'
);
check('arca_scrapper lee parametro_periodo', scp.ok, scp.det);
const par = await como('arca_portal', 'select count(*) from credencial_afip');
check('arca_portal sin credencial_afip', !par.ok, par.det);

// 4. spot: delta R10 presente
const [emp] =
  await r`select count(*)::int c from empleado where nombre ilike ${'%CARBALLO%MATIAS%'}`;
check('empleado CARBALLO MATIAS (delta R10)', emp.c >= 1, `${emp.c}`);
const [rrs] =
  await r`select iibb_regimen from cliente where cuit = ${'30714955930'}`;
check(
  'RR SLOT iibb=local (delta R10)',
  rrs?.iibb_regimen === 'local',
  String(rrs?.iibb_regimen)
);
const [topes] = await r`select max(periodo)::text m from parametro_periodo`;
check('tope imponible al día', (topes.m ?? '') >= '2026-08-01', topes.m);

console.log(
  `\n${fallos === 0 ? '══ CONTABLE: TODO VERDE ══' : `══ CONTABLE: ${fallos} FALLO(S) ══`}`
);
await Promise.all([r.end(), l.end()]);
process.exit(fallos === 0 ? 0 : 1);
