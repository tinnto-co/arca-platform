/**
 * Carga/actualiza escalas salariales de Comercio (CCT 130/75) para el acuerdo
 * firmado el 26/03/2026 (períodos Abril–Junio 2026 y absorción desde Julio 2026).
 *
 * Estructura del acuerdo:
 *  - Abril / Mayo / Junio 2026: básico + $100.000 NR + $20.000 recomposición
 *  - Desde Julio 2026: los adicionales se absorben en el básico (sin rubro NR)
 *    Los montos básicos de Julio en adelante son idénticos a los de Junio 2026.
 *
 * Fuente: https://estudiovilaplana.com.ar/escala-salarial-empleados-comercio/
 *
 * Uso:
 *   bun run src/scripts/seed-comercio-abr2026.ts
 *   bun run src/scripts/seed-comercio-abr2026.ts --dry-run
 */
import 'dotenv/config';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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

// Suma no remunerativa total del período Abril–Junio 2026
// ($100.000 NR + $20.000 recomposición = $120.000)
const NR_ABR_JUN = 120_000;

type EscalaRef = { codigo: string; nombre: string; basico: number };

// ─────────────────────────────────────────────────────────────────────────────
// Datos por período
// ─────────────────────────────────────────────────────────────────────────────

const ESCALAS_ABRIL_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',           basico: 1_078_911 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',           basico: 1_082_029 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',           basico: 1_092_951 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',       basico: 1_090_613 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',       basico: 1_095_298 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',       basico: 1_099_977 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',       basico: 1_114_022 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',       basico: 1_125_724 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',       basico: 1_142_890 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',              basico: 1_094_513 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',              basico: 1_099_977 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',              basico: 1_106_999 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',    basico: 1_094_513 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',    basico: 1_102_315 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',    basico: 1_128_065 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_103_879 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_117_922 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',           basico: 1_094_513 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',           basico: 1_117_925 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',           basico: 1_125_724 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',           basico: 1_142_890 },
];

const ESCALAS_MAYO_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',           basico: 1_096_248 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',           basico: 1_099_412 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',           basico: 1_110_495 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',       basico: 1_108_122 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',       basico: 1_112_876 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',       basico: 1_117_623 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',       basico: 1_131_875 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',       basico: 1_143_749 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',       basico: 1_161_167 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',              basico: 1_112_079 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',              basico: 1_117_623 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',              basico: 1_124_749 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',    basico: 1_112_079 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',    basico: 1_119_996 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',    basico: 1_146_125 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_121_583 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_135_832 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',           basico: 1_112_079 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',           basico: 1_135_835 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',           basico: 1_143_749 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',           basico: 1_161_167 },
];

const ESCALAS_JUNIO_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',           basico: 1_113_585 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',           basico: 1_116_794 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',           basico: 1_128_038 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',       basico: 1_125_631 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',       basico: 1_130_454 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',       basico: 1_135_270 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',       basico: 1_149_729 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',       basico: 1_161_775 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',       basico: 1_179_445 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',              basico: 1_129_646 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',              basico: 1_135_270 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',              basico: 1_142_499 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',    basico: 1_129_646 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',    basico: 1_137_677 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',    basico: 1_164_184 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_139_287 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_153_743 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',           basico: 1_129_646 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',           basico: 1_153_746 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',           basico: 1_161_775 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',           basico: 1_179_445 },
];

// Julio 2026 en adelante: mismos básicos que Junio, sin suma NR
// (los adicionales quedan absorbidos en el básico)
const ESCALAS_JUL2026_EN_ADELANTE = ESCALAS_JUNIO_2026;

// ─────────────────────────────────────────────────────────────────────────────
// Períodos
// ─────────────────────────────────────────────────────────────────────────────

type Periodo = {
  label: string;
  desde: Date;
  hasta: Date | null;
  escalas: EscalaRef[];
  noRemunerativo: number;
};

const PERIODOS: Periodo[] = [
  {
    label: 'Abril 2026',
    desde: new Date('2026-04-01'),
    hasta: new Date('2026-04-30'),
    escalas: ESCALAS_ABRIL_2026,
    noRemunerativo: NR_ABR_JUN,
  },
  {
    label: 'Mayo 2026',
    desde: new Date('2026-05-01'),
    hasta: new Date('2026-05-31'),
    escalas: ESCALAS_MAYO_2026,
    noRemunerativo: NR_ABR_JUN,
  },
  {
    label: 'Junio 2026',
    desde: new Date('2026-06-01'),
    hasta: new Date('2026-06-30'),
    escalas: ESCALAS_JUNIO_2026,
    noRemunerativo: NR_ABR_JUN,
  },
  {
    label: 'Julio 2026 - Marzo 2031 (absorción NR)',
    desde: new Date('2026-07-01'),
    hasta: new Date('2031-03-31'),
    escalas: ESCALAS_JUL2026_EN_ADELANTE,
    noRemunerativo: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function canon(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL');
  }

  const convenios = await db
    .select({
      id: payrollConvenio.id,
      clientId: payrollConvenio.clientId,
      nombre: payrollConvenio.nombre,
    })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, '130/75'));

  if (convenios.length === 0) {
    console.log('No hay convenios con CCT 130/75. Nada que hacer.');
    return;
  }
  console.log(`Convenios CCT 130/75 encontrados: ${convenios.length}`);

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
  let skippedEscala = 0;
  let insertsConcepto = 0;
  let updatesConcepto = 0;

  for (const conv of convenios) {
    const cats = byConvenio.get(conv.id) ?? [];
    const catByCanon = new Map(cats.map((c) => [canon(c.nombre), c]));

    // ── Escalas por período ──────────────────────────────────────────────────
    for (const periodo of PERIODOS) {
      for (const ref of periodo.escalas) {
        const cat = catByCanon.get(canon(ref.nombre));
        if (!cat) {
          skippedEscala++;
          continue;
        }

        // Busca registro existente por categoriaId + vigenciaDesde + periodoLabel
        const whereClause = periodo.hasta
          ? and(
              eq(payrollEscala.categoriaId, cat.id),
              eq(payrollEscala.vigenciaDesde, periodo.desde),
              eq(payrollEscala.periodoLabel, periodo.label)
            )
          : and(
              eq(payrollEscala.categoriaId, cat.id),
              eq(payrollEscala.vigenciaDesde, periodo.desde),
              eq(payrollEscala.periodoLabel, periodo.label),
              isNull(payrollEscala.vigenciaHasta)
            );

        const [existing] = await db
          .select({ id: payrollEscala.id })
          .from(payrollEscala)
          .where(whereClause)
          .limit(1);

        if (!DRY_RUN) {
          if (existing) {
            await db
              .update(payrollEscala)
              .set({
                montoBasico: String(ref.basico),
                montoNoRemunerativo: String(periodo.noRemunerativo),
                vigenciaHasta: periodo.hasta,
                fuente: SOURCE_URL,
                updatedAt: new Date(),
              })
              .where(eq(payrollEscala.id, existing.id));
          } else {
            await db.insert(payrollEscala).values({
              categoriaId: cat.id,
              vigenciaDesde: periodo.desde,
              vigenciaHasta: periodo.hasta,
              montoBasico: String(ref.basico),
              montoNoRemunerativo: String(periodo.noRemunerativo),
              periodoLabel: periodo.label,
              fuente: SOURCE_URL,
            });
          }
        }
        upsertsEscala++;
      }
    }

    // ── Concepto NR (acuerdo 03/2026, vigente Abril–Junio 2026) ─────────────
    // Actualiza o crea el concepto de suma no remunerativa ($120.000 = $100K NR + $20K recomposición).
    // Vigencia Abril–Junio 2026; a partir de Julio se desactiva (absorbido en básico).
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
            formula: String(NR_ABR_JUN),
            esPorcentaje: false,
            codigo: '540000',
            codigoArca: '540000',
            numeroSos: 411,
            activo: true,
            vigenciaDesde: new Date('2026-04-01'),
            vigenciaHasta: new Date('2026-06-30'),
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
          formula: String(NR_ABR_JUN),
          esPorcentaje: false,
          orden: 411,
          activo: true,
          vigenciaDesde: new Date('2026-04-01'),
          vigenciaHasta: new Date('2026-06-30'),
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
    `[${DRY_RUN ? 'dry-run' : 'ok'}] ` +
      `Escalas procesadas: ${upsertsEscala} | ` +
      `Categorías no encontradas: ${skippedEscala} | ` +
      `Conceptos NR insertados: ${insertsConcepto} | actualizados: ${updatesConcepto}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
