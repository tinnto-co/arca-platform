/**
 * Carga todas las escalas de Comercio (CCT 130/75) en un único bulk insert.
 * Borra primero las escalas existentes de los períodos cubiertos, luego inserta todo.
 *
 * Períodos cubiertos:
 *  - Marzo 2026 (resumen)
 *  - Abril / Mayo / Junio 2026 (acuerdo 03/2026)
 *  - Julio 2026 en adelante (absorción NR)
 *
 * Uso:
 *   bun run src/scripts/seed-comercio-escalas-bulk.ts
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payrollConvenio, payrollConvenioCategoria, payrollEscala } from '@/drizzle/schema';

const SOURCE_URL = 'https://estudiovilaplana.com.ar/escala-salarial-empleados-comercio/';

interface EscalaRef { codigo: string; nombre: string; basico: number; noRemunerativo?: number }

// ── Datos ─────────────────────────────────────────────────────────────────────

const MARZO_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',             basico: 1_055_795, noRemunerativo: 100_000 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',             basico: 1_058_852, noRemunerativo: 100_000 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',             basico: 1_069_560, noRemunerativo: 100_000 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',         basico: 1_067_268, noRemunerativo: 100_000 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',         basico: 1_071_860, noRemunerativo: 100_000 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',         basico: 1_076_448, noRemunerativo: 100_000 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',         basico: 1_090_218, noRemunerativo: 100_000 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',         basico: 1_101_690, noRemunerativo: 100_000 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',         basico: 1_118_519, noRemunerativo: 100_000 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',                basico: 1_071_091, noRemunerativo: 100_000 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',                basico: 1_076_448, noRemunerativo: 100_000 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',                basico: 1_083_333, noRemunerativo: 100_000 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',      basico: 1_071_091, noRemunerativo: 100_000 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',      basico: 1_078_740, noRemunerativo: 100_000 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',      basico: 1_103_985, noRemunerativo: 100_000 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_080_274, noRemunerativo: 100_000 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_094_041, noRemunerativo: 100_000 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',             basico: 1_071_091, noRemunerativo: 100_000 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',             basico: 1_094_044, noRemunerativo: 100_000 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',             basico: 1_101_690, noRemunerativo: 100_000 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',             basico: 1_118_519, noRemunerativo: 100_000 },
];

const ABRIL_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',             basico: 1_078_911 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',             basico: 1_082_029 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',             basico: 1_092_951 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',         basico: 1_090_613 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',         basico: 1_095_298 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',         basico: 1_099_977 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',         basico: 1_114_022 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',         basico: 1_125_724 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',         basico: 1_142_890 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',                basico: 1_094_513 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',                basico: 1_099_977 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',                basico: 1_106_999 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',      basico: 1_094_513 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',      basico: 1_102_315 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',      basico: 1_128_065 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_103_879 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_117_922 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',             basico: 1_094_513 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',             basico: 1_117_925 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',             basico: 1_125_724 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',             basico: 1_142_890 },
];

const MAYO_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',             basico: 1_096_248 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',             basico: 1_099_412 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',             basico: 1_110_495 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',         basico: 1_108_122 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',         basico: 1_112_876 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',         basico: 1_117_623 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',         basico: 1_131_875 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',         basico: 1_143_749 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',         basico: 1_161_167 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',                basico: 1_112_079 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',                basico: 1_117_623 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',                basico: 1_124_749 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',      basico: 1_112_079 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',      basico: 1_119_996 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',      basico: 1_146_125 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_121_583 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_135_832 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',             basico: 1_112_079 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',             basico: 1_135_835 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',             basico: 1_143_749 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',             basico: 1_161_167 },
];

const JUNIO_2026: EscalaRef[] = [
  { codigo: 'MA_A',    nombre: 'Maestranza A',             basico: 1_113_585 },
  { codigo: 'MA_B',    nombre: 'Maestranza B',             basico: 1_116_794 },
  { codigo: 'MA_C',    nombre: 'Maestranza C',             basico: 1_128_038 },
  { codigo: 'ADM_A',   nombre: 'Administrativo A',         basico: 1_125_631 },
  { codigo: 'ADM_B',   nombre: 'Administrativo B',         basico: 1_130_454 },
  { codigo: 'ADM_C',   nombre: 'Administrativo C',         basico: 1_135_270 },
  { codigo: 'ADM_D',   nombre: 'Administrativo D',         basico: 1_149_729 },
  { codigo: 'ADM_E',   nombre: 'Administrativo E',         basico: 1_161_775 },
  { codigo: 'ADM_F',   nombre: 'Administrativo F',         basico: 1_179_445 },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A',                basico: 1_129_646 },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B',                basico: 1_135_270 },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C',                basico: 1_142_499 },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A',      basico: 1_129_646 },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B',      basico: 1_137_677 },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C',      basico: 1_164_184 },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A', basico: 1_139_287 },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B', basico: 1_153_743 },
  { codigo: 'VEN_A',   nombre: 'Vendedores A',             basico: 1_129_646 },
  { codigo: 'VEN_B',   nombre: 'Vendedores B',             basico: 1_153_746 },
  { codigo: 'VEN_C',   nombre: 'Vendedores C',             basico: 1_161_775 },
  { codigo: 'VEN_D',   nombre: 'Vendedores D',             basico: 1_179_445 },
];

// Julio en adelante: mismos básicos que Junio, sin NR
const JULIO_2026 = JUNIO_2026;

interface Periodo {
  label: string;
  desde: Date;
  hasta: Date | null;
  escalas: EscalaRef[];
  noRemunerativo: number;
}

const PERIODOS: Periodo[] = [
  { label: 'Marzo 2026 (resumen)', desde: new Date('2026-03-01'), hasta: new Date('2026-03-31'), escalas: MARZO_2026, noRemunerativo: 100_000 },
  { label: 'Abril 2026',           desde: new Date('2026-04-01'), hasta: new Date('2026-04-30'), escalas: ABRIL_2026, noRemunerativo: 120_000 },
  { label: 'Mayo 2026',            desde: new Date('2026-05-01'), hasta: new Date('2026-05-31'), escalas: MAYO_2026,  noRemunerativo: 120_000 },
  { label: 'Junio 2026',           desde: new Date('2026-06-01'), hasta: new Date('2026-06-30'), escalas: JUNIO_2026, noRemunerativo: 120_000 },
  { label: 'Julio 2026 - Marzo 2031 (absorción NR)', desde: new Date('2026-07-01'), hasta: new Date('2031-03-31'), escalas: JULIO_2026, noRemunerativo: 0 },
];

function canon(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  // 1. Cargar convenios y categorías de una sola vez
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, '130/75'));

  if (convenios.length === 0) { console.log('No hay convenios CCT 130/75.'); return; }

  const convenioIds = convenios.map((c) => c.id);
  const categorias = await db
    .select({ id: payrollConvenioCategoria.id, convenioId: payrollConvenioCategoria.convenioId, nombre: payrollConvenioCategoria.nombre })
    .from(payrollConvenioCategoria)
    .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));

  // Mapa: convenioId → Map<canonNombre, categoriaId>
  const catMap = new Map<string, Map<string, string>>();
  for (const cat of categorias) {
    if (!catMap.has(cat.convenioId)) catMap.set(cat.convenioId, new Map());
    catMap.get(cat.convenioId)!.set(canon(cat.nombre), cat.id);
  }

  // 2. Borrar escalas existentes de estos convenios para los períodos que vamos a reinsertar
  const categoriaIds = categorias.map((c) => c.id);
  if (categoriaIds.length > 0) {
    await db.delete(payrollEscala).where(inArray(payrollEscala.categoriaId, categoriaIds));
    console.log('Escalas anteriores eliminadas.');
  }

  // 3. Construir todas las filas a insertar
  const rows = [];
  for (const conv of convenios) {
    const byNombre = catMap.get(conv.id) ?? new Map();
    for (const periodo of PERIODOS) {
      for (const ref of periodo.escalas) {
        const categoriaId = byNombre.get(canon(ref.nombre));
        if (!categoriaId) continue;
        rows.push({
          categoriaId,
          vigenciaDesde: periodo.desde,
          vigenciaHasta: periodo.hasta,
          montoBasico: String(ref.basico),
          montoNoRemunerativo: String(ref.noRemunerativo ?? periodo.noRemunerativo),
          periodoLabel: periodo.label,
          fuente: SOURCE_URL,
        });
      }
    }
  }

  // 4. Bulk insert
  if (rows.length > 0) {
    await db.insert(payrollEscala).values(rows);
  }

  console.log(`[ok] Convenios: ${convenios.length} | Categorías: ${categorias.length} | Escalas insertadas: ${rows.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
