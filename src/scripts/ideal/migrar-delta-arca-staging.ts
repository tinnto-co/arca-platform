/**
 * Migra a `contable` el trabajo que el estudio hizo en `arca_staging` después
 * del restore del 04/08 (R10 del plan): recibos, el empleado nuevo, la clave
 * re-cargada de una credencial y una edición de iibb.
 *
 * Corte temporal: todo lo creado en arca_staging después del 2026-08-04 12:00
 * UTC (el restore fue 04/08 ~11:39). Los ids de cliente/empleado/catálogos
 * comparten linaje entre ambas bases (los preserva el ETL), pero `concepto` se
 * resuelve por `numero` por las dudas.
 *
 * Uso: SRC_URL=<arca_staging> DST_URL=<contable> bun migrar-delta-arca-staging.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const CORTE = '2026-08-04 12:00:00+00';

const src = postgres(process.env.SRC_URL!, { max: 1, onnotice: () => {} });
const dst = postgres(process.env.DST_URL!, { max: 1, onnotice: () => {} });
if (!process.env.SRC_URL!.includes('arca_staging'))
  throw new Error('SRC debe ser arca_staging');
if (!process.env.DST_URL!.includes('contable'))
  throw new Error('DST debe ser contable');

type Row = Record<string, any>;

// ── inventario ──
const empleados = (await src.unsafe(
  `select * from empleado where created_at > $1`,
  [CORTE]
)) as unknown as Row[];
const recibos = (await src.unsafe(
  `select * from recibo where created_at > $1`,
  [CORTE]
)) as unknown as Row[];
// Recibos preexistentes que el estudio recalculó después del corte: la fila
// se pisa entera en el destino y sus conceptos nuevos se insertan.
const recibosModificados = (await src.unsafe(
  `select * from recibo where updated_at > $1 and created_at <= $1`,
  [CORTE]
)) as unknown as Row[];
const reciboIds = [...recibos, ...recibosModificados].map((r) => r.id);
// Se toma el estado ACTUAL completo de cada recibo afectado: para los nuevos
// es todo suyo, y para los recalculados el set del destino se reemplaza
// entero (el recálculo del estudio borró los renglones viejos e insertó los
// nuevos — copiar solo los post-corte chocaría con los del linaje de prod).
const conceptos = reciboIds.length
  ? ((await src.unsafe(
      `select rc.*, c.numero as concepto_numero from recibo_concepto rc
       join concepto c on c.id = rc.concepto_id
       where rc.recibo_id = any($1)`,
      [reciboIds]
    )) as unknown as Row[])
  : [];

console.log(`empleados nuevos: ${empleados.length}`);
for (const e of empleados)
  console.log(`  · ${e.apellido} ${e.nombre ?? ''} (cliente ${e.cliente_id})`);
console.log(
  `recibos nuevos: ${recibos.length}, recalculados: ${recibosModificados.length} (conceptos a migrar: ${conceptos.length})`
);

// credencial Cella: la clave re-cargada el 11/08
const [cella] = (await src.unsafe(
  `select cuit, clave, ultimo_login_ok, updated_at from credencial_afip where cuit = '20221096399'`
)) as unknown as Row[];
console.log(
  `credencial 20221096399: updated ${cella?.updated_at?.toISOString?.() ?? cella?.updated_at}`
);

// RR SLOT iibb
const [rrslot] = (await src.unsafe(
  `select cuit, iibb_regimen from cliente where cuit = '30714955930'`
)) as unknown as Row[];
console.log(`RR SLOT iibb_regimen en staging: ${rrslot?.iibb_regimen}`);

if (!APPLY) {
  console.log('\nDRY-RUN. Correr con --apply.');
  await Promise.all([src.end(), dst.end()]);
  process.exit(0);
}

// mapa de concepto por numero en el destino
const dstConceptos = await dst`select id, numero from concepto`;
const conceptoPorNumero = new Map(dstConceptos.map((c) => [c.numero, c.id]));

await dst.begin(async (tx) => {
  for (const e of empleados) {
    const [ya] = await tx`select id from empleado where id = ${e.id}`;
    if (ya) {
      console.log(`  empleado ${e.id} ya está`);
      continue;
    }
    await tx`insert into empleado ${tx(e as Record<string, unknown>)}`;
  }
  let recibosNuevos = 0,
    conceptosNuevos = 0,
    recibosPisados = 0;
  for (const r of recibos) {
    const [ya] = await tx`select id from recibo where id = ${r.id}`;
    if (ya) {
      console.log(`  recibo ${r.id} ya está`);
      continue;
    }
    await tx`insert into recibo ${tx(r as Record<string, unknown>)}`;
    recibosNuevos++;
  }
  for (const r of recibosModificados) {
    const { id, ...resto } = r as Record<string, unknown>;
    const [ya] = await tx`select id from recibo where id = ${id as string}`;
    if (!ya) {
      console.log(
        `  recibo recalculado ${id} NO existe en destino — se inserta`
      );
      await tx`insert into recibo ${tx(r as Record<string, unknown>)}`;
    } else await tx`update recibo set ${tx(resto)} where id = ${id as string}`;
    // el set de conceptos del destino se reemplaza por el de staging
    await tx`delete from recibo_concepto where recibo_id = ${id as string}`;
    recibosPisados++;
  }
  for (const c of conceptos) {
    const { concepto_numero, ...row } = c;
    const [ya] = await tx`select id from recibo_concepto where id = ${row.id}`;
    if (ya) continue;
    const conceptoId = conceptoPorNumero.get(concepto_numero);
    if (!conceptoId)
      throw new Error(
        `concepto numero ${concepto_numero} no existe en destino`
      );
    row.concepto_id = conceptoId;
    await tx`insert into recibo_concepto ${tx(row as Record<string, unknown>)}`;
    conceptosNuevos++;
  }
  // credencial Cella: la clave más nueva gana
  if (cella) {
    await tx`update credencial_afip
      set clave = ${cella.clave}, ultimo_login_ok = ${cella.ultimo_login_ok}, updated_at = now()
      where cuit = ${cella.cuit}`;
  }
  // RR SLOT: iibb editado el 11/08
  if (rrslot?.iibb_regimen) {
    await tx`update cliente set iibb_regimen = ${rrslot.iibb_regimen} where cuit = ${rrslot.cuit}`;
  }
  console.log(
    `\n✓ Migrado: ${empleados.length} empleados, ${recibosNuevos} recibos nuevos, ${recibosPisados} recalculados, ${conceptosNuevos} conceptos, credencial Cella y RR SLOT.`
  );
});

await Promise.all([src.end(), dst.end()]);
