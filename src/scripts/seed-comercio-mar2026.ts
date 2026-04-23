/**
 * Carga/actualiza escalas salariales de Comercio (CCT 130/75) para Marzo 2026
 * y asegura el concepto de suma fija no remunerativa ($100.000).
 *
 * Uso:
 *   bun run src/scripts/seed-comercio-mar2026.ts
 *   bun run src/scripts/seed-comercio-mar2026.ts --dry-run
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  payrollConcepto,
  payrollConvenio,
  payrollConvenioCategoria,
  payrollEscala,
} from '@/drizzle/schema';

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE_URL =
  'https://estudiovilaplana.com.ar/escala-salarial-empleados-comercio/';
const PERIODO_LABEL = 'Marzo 2026 (resumen)';
const VIGENCIA_DESDE = new Date('2026-03-01');
const VIGENCIA_HASTA = new Date('2026-03-31');

type EscalaRef = {
  codigo: string;
  nombre: string;
  basico: number;
  noRemunerativo: number;
};

const ESCALAS_MARZO_2026: EscalaRef[] = [
  { codigo: 'MA_A', nombre: 'Maestranza A', basico: 1055795, noRemunerativo: 100000 },
  { codigo: 'MA_B', nombre: 'Maestranza B', basico: 1058852, noRemunerativo: 100000 },
  { codigo: 'MA_C', nombre: 'Maestranza C', basico: 1069560, noRemunerativo: 100000 },
  { codigo: 'ADM_A', nombre: 'Administrativo A', basico: 1067268, noRemunerativo: 100000 },
  { codigo: 'ADM_B', nombre: 'Administrativo B', basico: 1071860, noRemunerativo: 100000 },
  { codigo: 'ADM_C', nombre: 'Administrativo C', basico: 1076448, noRemunerativo: 100000 },
  { codigo: 'ADM_D', nombre: 'Administrativo D', basico: 1090218, noRemunerativo: 100000 },
  { codigo: 'ADM_E', nombre: 'Administrativo E', basico: 1101690, noRemunerativo: 100000 },
  { codigo: 'ADM_F', nombre: 'Administrativo F', basico: 1118519, noRemunerativo: 100000 },
  { codigo: 'CAJ_A', nombre: 'Cajeros A', basico: 1071091, noRemunerativo: 100000 },
  { codigo: 'CAJ_B', nombre: 'Cajeros B', basico: 1076448, noRemunerativo: 100000 },
  { codigo: 'CAJ_C', nombre: 'Cajeros C', basico: 1083333, noRemunerativo: 100000 },
  { codigo: 'AUX_A', nombre: 'Personal Auxiliar A', basico: 1071091, noRemunerativo: 100000 },
  { codigo: 'AUX_B', nombre: 'Personal Auxiliar B', basico: 1078740, noRemunerativo: 100000 },
  { codigo: 'AUX_C', nombre: 'Personal Auxiliar C', basico: 1103985, noRemunerativo: 100000 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1080274, noRemunerativo: 100000 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1094041, noRemunerativo: 100000 },
  { codigo: 'VEN_A', nombre: 'Vendedores A', basico: 1071091, noRemunerativo: 100000 },
  { codigo: 'VEN_B', nombre: 'Vendedores B', basico: 1094044, noRemunerativo: 100000 },
  { codigo: 'VEN_C', nombre: 'Vendedores C', basico: 1101690, noRemunerativo: 100000 },
  { codigo: 'VEN_D', nombre: 'Vendedores D', basico: 1118519, noRemunerativo: 100000 },
];

function canon(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL');
  }

  const convenios = await db
    .select({
      id: payrollConvenio.id,
      clientId: payrollConvenio.clientId,
      nombre: payrollConvenio.nombre,
      cctCodigo: payrollConvenio.cctCodigo,
    })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, '130/75'));

  if (convenios.length === 0) {
    console.log('No hay convenios con CCT 130/75.');
    return;
  }

  const convenioIds = convenios.map((c) => c.id);
  const categorias = await db
    .select({
      id: payrollConvenioCategoria.id,
      convenioId: payrollConvenioCategoria.convenioId,
      nombre: payrollConvenioCategoria.nombre,
      codigo: payrollConvenioCategoria.codigo,
    })
    .from(payrollConvenioCategoria)
    .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));

  const byConvenio = new Map<string, typeof categorias>();
  for (const cat of categorias) {
    const arr = byConvenio.get(cat.convenioId) ?? [];
    arr.push(cat);
    byConvenio.set(cat.convenioId, arr);
  }

  let upsertsEscala = 0;
  let insertsConcepto = 0;
  let updatesConcepto = 0;

  for (const conv of convenios) {
    const cats = byConvenio.get(conv.id) ?? [];
    const catByCanon = new Map(cats.map((c) => [canon(c.nombre), c]));

    for (const ref of ESCALAS_MARZO_2026) {
      const cat = catByCanon.get(canon(ref.nombre));
      if (!cat) continue;

      const [existing] = await db
        .select({ id: payrollEscala.id })
        .from(payrollEscala)
        .where(
          and(
            eq(payrollEscala.categoriaId, cat.id),
            eq(payrollEscala.vigenciaDesde, VIGENCIA_DESDE),
            eq(payrollEscala.vigenciaHasta, VIGENCIA_HASTA),
            eq(payrollEscala.periodoLabel, PERIODO_LABEL)
          )
        )
        .limit(1);

      if (!DRY_RUN) {
        if (existing) {
          await db
            .update(payrollEscala)
            .set({
              montoBasico: String(ref.basico),
              montoNoRemunerativo: String(ref.noRemunerativo),
              fuente: SOURCE_URL,
              updatedAt: new Date(),
            })
            .where(eq(payrollEscala.id, existing.id));
        } else {
          await db.insert(payrollEscala).values({
            categoriaId: cat.id,
            vigenciaDesde: VIGENCIA_DESDE,
            vigenciaHasta: VIGENCIA_HASTA,
            montoBasico: String(ref.basico),
            montoNoRemunerativo: String(ref.noRemunerativo),
            periodoLabel: PERIODO_LABEL,
            fuente: SOURCE_URL,
          });
        }
      }
      upsertsEscala++;
    }

    const [concepto] = await db
      .select({ id: payrollConcepto.id })
      .from(payrollConcepto)
      .where(
        and(
          eq(payrollConcepto.clientId, conv.clientId),
          eq(payrollConcepto.numeroSos, 411)
        )
      )
      .limit(1);

    if (!DRY_RUN) {
      if (concepto) {
        await db
          .update(payrollConcepto)
          .set({
            nombre: 'Asignacion no remunerativa acuerdo 03/2026',
            tipo: 'no_remunerativo',
            baseCalculo: 'fijo',
            formula: '100000',
            esPorcentaje: false,
            codigo: '540000',
            codigoArca: '540000',
            numeroSos: 411,
            activo: true,
            vigenciaDesde: VIGENCIA_DESDE,
            vigenciaHasta: VIGENCIA_HASTA,
            updatedAt: new Date(),
          })
          .where(eq(payrollConcepto.id, concepto.id));
        updatesConcepto++;
      } else {
        await db.insert(payrollConcepto).values({
          clientId: conv.clientId,
          codigo: '540000',
          nombre: 'Asignacion no remunerativa acuerdo 03/2026',
          tipo: 'no_remunerativo',
          baseCalculo: 'fijo',
          formula: '100000',
          esPorcentaje: false,
          orden: 411,
          activo: true,
          vigenciaDesde: VIGENCIA_DESDE,
          vigenciaHasta: VIGENCIA_HASTA,
          numeroSos: 411,
          codigoArca: '540000',
          baseColumna: 'importe_fijo',
          divCantidad: '1',
          divHsNorm: false,
        });
        insertsConcepto++;
      }
    }
  }

  console.log(
    `[${DRY_RUN ? 'dry-run' : 'ok'}] Escalas procesadas: ${upsertsEscala} | ` +
      `Conceptos 411 insertados: ${insertsConcepto} | actualizados: ${updatesConcepto}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
