/**
 * Contraparte de los movimientos bancarios ya importados.
 *
 * Desde que la importación resuelve la contraparte (CUIT de la descripción →
 * se asigna; importe exacto de una factura → se sugiere), los movimientos
 * nuevos la traen. Este script hace lo mismo con los que se importaron antes,
 * con la misma lógica (`src/lib/contraparte-movimiento.ts`).
 *
 * Solo toca movimientos sin `contraparte_id` y no pisa una contraparte ni un
 * texto que ya estén: idempotente.
 *
 * Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-contraparte-movimientos.ts [--apply]
 */
import postgres from 'postgres';
import {
  resolverContrapartes,
  type BusquedasContraparte,
  type ContraparteResuelta,
} from '../../lib/contraparte-movimiento';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;

if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

const sql = postgres(URL, { max: 1 });

const [quien] = await sql`
  select current_user as usuario, current_database() as base`;
console.log(`\nBase: ${quien.base} — conectado como ${quien.usuario}`);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

const clientes = await sql<
  { clienteId: string; razonSocial: string; cuit: string | null }[]
>`
  select distinct c.id as "clienteId", c.razon_social as "razonSocial", c.cuit
  from movimiento_bancario m
  join cuenta_bancaria cb on cb.id = m.cuenta_bancaria_id
  join cliente c on c.id = cb.cliente_id
  where m.contraparte_id is null
  order by c.razon_social`;

function busquedas(clienteId: string): BusquedasContraparte {
  return {
    porDocumento: async (cuits, dnis) =>
      await sql<
        {
          id: string;
          docTipo: 'cuit' | 'dni' | 'otro';
          docNro: string;
          nombre: string | null;
        }[]
      >`
        select id, doc_tipo as "docTipo", doc_nro as "docNro", nombre
        from contraparte
        where (doc_tipo = 'cuit' and doc_nro in ${sql(cuits)})
           ${dnis.length > 0 ? sql`or (doc_tipo = 'dni' and doc_nro in ${sql(dnis)})` : sql``}`,
    queOperanConLaEmpresa: async (ids) =>
      new Set(
        (
          await sql<{ id: string }[]>`
            select distinct contraparte_id as id from comprobante
            where cliente_id = ${clienteId} and contraparte_id in ${sql(ids)}`
        ).map((r) => r.id)
      ),
    comprobantesPorImporte: async (importes, desde, hasta) =>
      (
        await sql<
          {
            id: string;
            total: string;
            fechaEmision: string;
            direccion: 'emitido' | 'recibido';
            contraparteId: string | null;
            contraparteNombre: string | null;
          }[]
        >`
          select co.id, co.total, co.fecha_emision::text as "fechaEmision",
                 co.direccion, co.contraparte_id as "contraparteId",
                 ct.nombre as "contraparteNombre"
          from comprobante co
          left join contraparte ct on ct.id = co.contraparte_id
          where co.cliente_id = ${clienteId}
            and co.fecha_emision between ${desde} and ${hasta}
            and round(co.total, 2) in ${sql(importes.map((i) => i.toFixed(2)))}`
      ).map((r) => ({ ...r, total: Number(r.total) })),
  };
}

type Cambio = { id: string; descripcion: string | null } & ContraparteResuelta;
const cambios: Cambio[] = [];

console.log(
  'Empresa'.padEnd(28) +
    'Movs'.padStart(6) +
    'CUIT→asignada'.padStart(15) +
    'CUIT como texto'.padStart(17) +
    'Sugerida'.padStart(10)
);
for (const c of clientes) {
  const movs = await sql<
    {
      id: string;
      descripcion: string | null;
      importe: string;
      fecha: string;
      direccion: 'ingreso' | 'egreso';
      categoria: string | null;
      contraparteTexto: string | null;
      tieneSugerida: boolean;
    }[]
  >`
    select m.id, m.descripcion, m.importe, m.fecha::text as fecha, m.direccion,
           m.categoria, m.contraparte_texto as "contraparteTexto",
           (m.datos_crudos ? 'contraparteSugerida') as "tieneSugerida"
    from movimiento_bancario m
    join cuenta_bancaria cb on cb.id = m.cuenta_bancaria_id
    where cb.cliente_id = ${c.clienteId} and m.contraparte_id is null`;

  const resueltas = await resolverContrapartes(
    movs.map((m) => ({ ...m, importe: Number(m.importe) })),
    c.cuit,
    busquedas(c.clienteId)
  );

  let asignadas = 0;
  let texto = 0;
  let sugeridas = 0;
  resueltas.forEach((r, i) => {
    const m = movs[i];
    // No se pisa lo que ya hay: solo se completa.
    const nuevoTexto = !m.contraparteTexto && r.contraparteTexto;
    const nuevaSugerida = !m.tieneSugerida && r.sugerida;
    if (!r.contraparteId && !nuevoTexto && !nuevaSugerida) return;
    if (r.contraparteId) asignadas++;
    else if (nuevoTexto) texto++;
    if (nuevaSugerida) sugeridas++;
    cambios.push({ id: m.id, descripcion: m.descripcion, ...r });
  });
  console.log(
    c.razonSocial.slice(0, 27).padEnd(28) +
      String(movs.length).padStart(6) +
      String(asignadas).padStart(15) +
      String(texto).padStart(17) +
      String(sugeridas).padStart(10)
  );
}

if (cambios.length === 0) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

console.log('\nEjemplos:');
for (const ej of [
  ...cambios.filter((x) => x.contraparteId).slice(0, 4),
  ...cambios.filter((x) => x.sugerida),
]) {
  const que = ej.contraparteId
    ? `→ ${ej.contraparteTexto}`
    : `→ posible: ${ej.sugerida?.nombre} (importe exacto)`;
  console.log(`  ${(ej.descripcion ?? '—').slice(0, 55).padEnd(56)}${que}`);
}

if (!APPLY) {
  console.log(
    `\nDry-run: nada se aplicó. Con --apply se actualizan ${cambios.length} movimientos.\n`
  );
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const ch of cambios) {
    await tx`
      update movimiento_bancario set
        contraparte_id = coalesce(contraparte_id, ${ch.contraparteId}),
        contraparte_texto = coalesce(contraparte_texto, ${ch.contraparteTexto}),
        updated_at = now()
      where id = ${ch.id} and contraparte_id is null`;
    // `sql.json` y no JSON.stringify: el driver serializa el valor, y un
    // string ya serializado quedaría guardado como texto y no como objeto.
    if (ch.sugerida) {
      await tx`
        update movimiento_bancario set
          datos_crudos = coalesce(datos_crudos, '{}'::jsonb)
            || jsonb_build_object('contraparteSugerida', ${tx.json({ ...ch.sugerida })}::jsonb)
        where id = ${ch.id}
          and not coalesce(datos_crudos, '{}'::jsonb) ? 'contraparteSugerida'`;
    }
  }
});

console.log(`\n✓ Listo: ${cambios.length} movimientos actualizados.\n`);
await sql.end();
