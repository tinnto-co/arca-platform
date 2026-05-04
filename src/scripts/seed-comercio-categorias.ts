/**
 * Crea/asegura las categorías de Comercio (CCT 130/75) para todos los convenios.
 * Idempotente: upsert por (convenioId, codigo).
 *
 * Uso:
 *   bun run src/scripts/seed-comercio-categorias.ts
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payrollConvenio, payrollConvenioCategoria } from '@/drizzle/schema';

const CATEGORIAS = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',             orden: 1 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',             orden: 2 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',             orden: 3 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',         orden: 4 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',         orden: 5 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',         orden: 6 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',         orden: 7 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',         orden: 8 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',         orden: 9 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',                orden: 10 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',                orden: 11 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',                orden: 12 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',      orden: 13 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',      orden: 14 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',      orden: 15 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', orden: 16 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', orden: 17 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',             orden: 18 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',             orden: 19 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',             orden: 20 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',             orden: 21 },
];

async function main() {
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, '130/75'));

  if (convenios.length === 0) {
    console.log('No hay convenios CCT 130/75.');
    return;
  }

  const convenioIds = convenios.map((c) => c.id);

  const existentes = await db
    .select({ convenioId: payrollConvenioCategoria.convenioId, codigo: payrollConvenioCategoria.codigo })
    .from(payrollConvenioCategoria)
    .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));

  const existenteSet = new Set(existentes.map((e) => `${e.convenioId}:${e.codigo}`));

  const toInsert = [];
  for (const conv of convenios) {
    for (const cat of CATEGORIAS) {
      if (existenteSet.has(`${conv.id}:${cat.codigo}`)) continue;
      toInsert.push({ convenioId: conv.id, codigo: cat.codigo, nombre: cat.nombre, orden: cat.orden });
    }
  }

  let insertadas = 0;
  if (toInsert.length > 0) {
    await db.insert(payrollConvenioCategoria).values(toInsert);
    insertadas = toInsert.length;
  }

  console.log(`[ok] Convenios: ${convenios.length} | Categorías insertadas: ${insertadas} | Ya existían: ${existentes.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
