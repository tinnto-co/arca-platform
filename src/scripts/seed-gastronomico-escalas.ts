/**
 * Carga las escalas salariales de Gastronómicos (CCT 389/04) para Abril–Junio 2026.
 * Borra primero las escalas existentes de las categorías del convenio, luego inserta todo.
 *
 * REQUISITO: Ejecutar seed-gastronomico-categorias.ts antes de este script.
 *
 * Períodos cubiertos:
 *  - Abril 2026  (Acuerdo 2025-2026, tercer tramo, firmado 01/04/2026)
 *  - Mayo 2026
 *  - Junio 2026
 *
 * Fuente: https://estudiovilaplana.com.ar/sueldos-gastronomicos/
 *
 * Uso:
 *   bun run src/scripts/seed-gastronomico-escalas.ts
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { payrollConvenio, payrollConvenioCategoria, payrollEscala } from '@/drizzle/schema';

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  connect_timeout: 30,
  idle_timeout: 5,
  max_lifetime: 60,
});
const db = drizzle(client);

const SOURCE_URL = 'https://estudiovilaplana.com.ar/sueldos-gastronomicos/';

type EscalaRef = { codigo: string; basico: number; noRemunerativo: number };

// ── Abril 2026 ─────────────────────────────────────────────────────────────────
const ABRIL_2026: EscalaRef[] = [
  // Cat 1
  { codigo: 'CAT1_1EST_D_Cadete',                 basico:   939_463, noRemunerativo:  37_000 },
  { codigo: 'CAT1_2EST_C_Cadete',                 basico:   961_129, noRemunerativo:  37_800 },
  { codigo: 'CAT1_3EST_B_Cadete',                 basico:   984_650, noRemunerativo:  38_700 },
  { codigo: 'CAT1_4EST_A_Cadete',                 basico: 1_018_924, noRemunerativo:  40_100 },
  { codigo: 'CAT1_5EST_Cadete',                   basico: 1_144_610, noRemunerativo:  45_000 },
  // Cat 2
  { codigo: 'CAT2_1EST_D_Montaplatos',            basico:   993_921, noRemunerativo:  39_100 },
  { codigo: 'CAT2_2EST_C_Montaplatos',            basico: 1_024_684, noRemunerativo:  40_300 },
  { codigo: 'CAT2_3EST_B_Montaplatos',            basico: 1_045_541, noRemunerativo:  41_100 },
  { codigo: 'CAT2_4EST_A_Montaplatos',            basico: 1_082_172, noRemunerativo:  42_600 },
  { codigo: 'CAT2_5EST_Montaplatos',              basico: 1_215_244, noRemunerativo:  47_800 },
  // Cat 3
  { codigo: 'CAT3_1EST_D_Ayudante_panadero',      basico: 1_042_501, noRemunerativo:  41_000 },
  { codigo: 'CAT3_2EST_C_Ayudante_panadero',      basico: 1_089_341, noRemunerativo:  42_800 },
  { codigo: 'CAT3_3EST_B_Ayudante_panadero',      basico: 1_119_502, noRemunerativo:  44_000 },
  { codigo: 'CAT3_4EST_A_Ayudante_panadero',      basico: 1_157_998, noRemunerativo:  45_500 },
  { codigo: 'CAT3_5EST_Ayudante_panadero',        basico: 1_273_137, noRemunerativo:  50_100 },
  // Cat 4
  { codigo: 'CAT4_1EST_D_Medio_oficial_panadero', basico: 1_098_211, noRemunerativo:  43_200 },
  { codigo: 'CAT4_2EST_C_Medio_oficial_panadero', basico: 1_133_480, noRemunerativo:  44_600 },
  { codigo: 'CAT4_3EST_B_Medio_oficial_panadero', basico: 1_154_918, noRemunerativo:  45_400 },
  { codigo: 'CAT4_4EST_A_Medio_oficial_panadero', basico: 1_217_949, noRemunerativo:  47_900 },
  { codigo: 'CAT4_5EST_Medio_oficial_panadero',   basico: 1_351_250, noRemunerativo:  53_100 },
  // Cat 5
  { codigo: 'CAT5_1EST_D_Comis_de_Cocina',        basico: 1_148_552, noRemunerativo:  45_200 },
  { codigo: 'CAT5_2EST_C_Comis_de_Cocina',        basico: 1_179_328, noRemunerativo:  46_400 },
  { codigo: 'CAT5_3EST_B_Comis_de_Cocina',        basico: 1_205_812, noRemunerativo:  47_400 },
  { codigo: 'CAT5_4EST_A_Comis_de_Cocina',        basico: 1_286_618, noRemunerativo:  50_600 },
  { codigo: 'CAT5_5EST_Comis_de_Cocina',          basico: 1_406_961, noRemunerativo:  55_300 },
  // Cat 6
  { codigo: 'CAT6_1EST_D_Jefe_de_Partida',        basico: 1_225_444, noRemunerativo:  48_200 },
  { codigo: 'CAT6_2EST_C_Jefe_de_Partida',        basico: 1_268_262, noRemunerativo:  49_900 },
  { codigo: 'CAT6_3EST_B_Jefe_de_Partida',        basico: 1_313_289, noRemunerativo:  51_700 },
  { codigo: 'CAT6_4EST_A_Jefe_de_Partida',        basico: 1_356_336, noRemunerativo:  53_300 },
  { codigo: 'CAT6_5EST_Jefe_de_Partida',          basico: 1_446_213, noRemunerativo:  56_900 },
  // Cat 7 (solo 3★, 4★, 5★)
  { codigo: 'CAT7_3EST_B_Jefe_de_brigada',        basico: 1_459_012, noRemunerativo:  57_400 },
  { codigo: 'CAT7_4EST_A_Jefe_de_brigada',        basico: 1_746_068, noRemunerativo:  68_700 },
  { codigo: 'CAT7_5EST_Jefe_de_brigada',          basico: 1_868_941, noRemunerativo:  73_500 },
];

// ── Mayo 2026 ──────────────────────────────────────────────────────────────────
const MAYO_2026: EscalaRef[] = [
  // Cat 1
  { codigo: 'CAT1_1EST_D_Cadete',                 basico:   953_555, noRemunerativo:  37_000 },
  { codigo: 'CAT1_2EST_C_Cadete',                 basico:   975_546, noRemunerativo:  37_800 },
  { codigo: 'CAT1_3EST_B_Cadete',                 basico:   999_420, noRemunerativo:  38_700 },
  { codigo: 'CAT1_4EST_A_Cadete',                 basico: 1_034_207, noRemunerativo:  40_100 },
  { codigo: 'CAT1_5EST_Cadete',                   basico: 1_161_779, noRemunerativo:  45_000 },
  // Cat 2
  { codigo: 'CAT2_1EST_D_Montaplatos',            basico: 1_008_830, noRemunerativo:  39_100 },
  { codigo: 'CAT2_2EST_C_Montaplatos',            basico: 1_040_054, noRemunerativo:  40_300 },
  { codigo: 'CAT2_3EST_B_Montaplatos',            basico: 1_061_224, noRemunerativo:  41_100 },
  { codigo: 'CAT2_4EST_A_Montaplatos',            basico: 1_098_404, noRemunerativo:  42_600 },
  { codigo: 'CAT2_5EST_Montaplatos',              basico: 1_233_472, noRemunerativo:  47_800 },
  // Cat 3
  { codigo: 'CAT3_1EST_D_Ayudante_panadero',      basico: 1_058_139, noRemunerativo:  41_000 },
  { codigo: 'CAT3_2EST_C_Ayudante_panadero',      basico: 1_105_681, noRemunerativo:  42_800 },
  { codigo: 'CAT3_3EST_B_Ayudante_panadero',      basico: 1_136_295, noRemunerativo:  44_000 },
  { codigo: 'CAT3_4EST_A_Ayudante_panadero',      basico: 1_175_368, noRemunerativo:  45_500 },
  { codigo: 'CAT3_5EST_Ayudante_panadero',        basico: 1_292_234, noRemunerativo:  50_100 },
  // Cat 4
  { codigo: 'CAT4_1EST_D_Medio_oficial_panadero', basico: 1_114_684, noRemunerativo:  43_200 },
  { codigo: 'CAT4_2EST_C_Medio_oficial_panadero', basico: 1_150_483, noRemunerativo:  44_600 },
  { codigo: 'CAT4_3EST_B_Medio_oficial_panadero', basico: 1_172_242, noRemunerativo:  45_400 },
  { codigo: 'CAT4_4EST_A_Medio_oficial_panadero', basico: 1_236_218, noRemunerativo:  47_900 },
  { codigo: 'CAT4_5EST_Medio_oficial_panadero',   basico: 1_371_519, noRemunerativo:  53_100 },
  // Cat 5
  { codigo: 'CAT5_1EST_D_Comis_de_Cocina',        basico: 1_165_780, noRemunerativo:  45_200 },
  { codigo: 'CAT5_2EST_C_Comis_de_Cocina',        basico: 1_197_018, noRemunerativo:  46_400 },
  { codigo: 'CAT5_3EST_B_Comis_de_Cocina',        basico: 1_223_889, noRemunerativo:  47_400 },
  { codigo: 'CAT5_4EST_A_Comis_de_Cocina',        basico: 1_305_917, noRemunerativo:  50_600 },
  { codigo: 'CAT5_5EST_Comis_de_Cocina',          basico: 1_428_066, noRemunerativo:  55_300 },
  // Cat 6
  { codigo: 'CAT6_1EST_D_Jefe_de_Partida',        basico: 1_243_826, noRemunerativo:  48_200 },
  { codigo: 'CAT6_2EST_C_Jefe_de_Partida',        basico: 1_287_286, noRemunerativo:  49_900 },
  { codigo: 'CAT6_3EST_B_Jefe_de_Partida',        basico: 1_332_989, noRemunerativo:  51_700 },
  { codigo: 'CAT6_4EST_A_Jefe_de_Partida',        basico: 1_376_681, noRemunerativo:  53_300 },
  { codigo: 'CAT6_5EST_Jefe_de_Partida',          basico: 1_467_906, noRemunerativo:  56_900 },
  // Cat 7 (solo 3★, 4★, 5★)
  { codigo: 'CAT7_3EST_B_Jefe_de_brigada',        basico: 1_480_897, noRemunerativo:  57_400 },
  { codigo: 'CAT7_4EST_A_Jefe_de_brigada',        basico: 1_772_259, noRemunerativo:  68_700 },
  { codigo: 'CAT7_5EST_Jefe_de_brigada',          basico: 1_896_975, noRemunerativo:  73_500 },
];

// ── Junio 2026 ─────────────────────────────────────────────────────────────────
const JUNIO_2026: EscalaRef[] = [
  // Cat 1
  { codigo: 'CAT1_1EST_D_Cadete',                 basico:   990_555, noRemunerativo:  37_000 },
  { codigo: 'CAT1_2EST_C_Cadete',                 basico: 1_013_346, noRemunerativo:  37_800 },
  { codigo: 'CAT1_3EST_B_Cadete',                 basico: 1_038_120, noRemunerativo:  38_700 },
  { codigo: 'CAT1_4EST_A_Cadete',                 basico: 1_074_307, noRemunerativo:  40_100 },
  { codigo: 'CAT1_5EST_Cadete',                   basico: 1_206_779, noRemunerativo:  45_000 },
  // Cat 2
  { codigo: 'CAT2_1EST_D_Montaplatos',            basico: 1_047_930, noRemunerativo:  39_100 },
  { codigo: 'CAT2_2EST_C_Montaplatos',            basico: 1_080_354, noRemunerativo:  40_300 },
  { codigo: 'CAT2_3EST_B_Montaplatos',            basico: 1_102_324, noRemunerativo:  41_100 },
  { codigo: 'CAT2_4EST_A_Montaplatos',            basico: 1_141_004, noRemunerativo:  42_600 },
  { codigo: 'CAT2_5EST_Montaplatos',              basico: 1_281_272, noRemunerativo:  47_800 },
  // Cat 3
  { codigo: 'CAT3_1EST_D_Ayudante_panadero',      basico: 1_099_139, noRemunerativo:  41_000 },
  { codigo: 'CAT3_2EST_C_Ayudante_panadero',      basico: 1_148_481, noRemunerativo:  42_800 },
  { codigo: 'CAT3_3EST_B_Ayudante_panadero',      basico: 1_180_295, noRemunerativo:  44_000 },
  { codigo: 'CAT3_4EST_A_Ayudante_panadero',      basico: 1_220_868, noRemunerativo:  45_500 },
  { codigo: 'CAT3_5EST_Ayudante_panadero',        basico: 1_342_334, noRemunerativo:  50_100 },
  // Cat 4
  { codigo: 'CAT4_1EST_D_Medio_oficial_panadero', basico: 1_157_884, noRemunerativo:  43_200 },
  { codigo: 'CAT4_2EST_C_Medio_oficial_panadero', basico: 1_195_083, noRemunerativo:  44_600 },
  { codigo: 'CAT4_3EST_B_Medio_oficial_panadero', basico: 1_217_642, noRemunerativo:  45_400 },
  { codigo: 'CAT4_4EST_A_Medio_oficial_panadero', basico: 1_284_118, noRemunerativo:  47_900 },
  { codigo: 'CAT4_5EST_Medio_oficial_panadero',   basico: 1_424_619, noRemunerativo:  53_100 },
  // Cat 5
  { codigo: 'CAT5_1EST_D_Comis_de_Cocina',        basico: 1_210_980, noRemunerativo:  45_200 },
  { codigo: 'CAT5_2EST_C_Comis_de_Cocina',        basico: 1_243_418, noRemunerativo:  46_400 },
  { codigo: 'CAT5_3EST_B_Comis_de_Cocina',        basico: 1_271_299, noRemunerativo:  47_400 },
  { codigo: 'CAT5_4EST_A_Comis_de_Cocina',        basico: 1_356_517, noRemunerativo:  50_600 },
  { codigo: 'CAT5_5EST_Comis_de_Cocina',          basico: 1_483_366, noRemunerativo:  55_300 },
  // Cat 6
  { codigo: 'CAT6_1EST_D_Jefe_de_Partida',        basico: 1_292_026, noRemunerativo:  48_200 },
  { codigo: 'CAT6_2EST_C_Jefe_de_Partida',        basico: 1_337_186, noRemunerativo:  49_900 },
  { codigo: 'CAT6_3EST_B_Jefe_de_Partida',        basico: 1_384_689, noRemunerativo:  51_700 },
  { codigo: 'CAT6_4EST_A_Jefe_de_Partida',        basico: 1_429_981, noRemunerativo:  53_300 },
  { codigo: 'CAT6_5EST_Jefe_de_Partida',          basico: 1_524_806, noRemunerativo:  56_900 },
  // Cat 7 (solo 3★, 4★, 5★)
  { codigo: 'CAT7_3EST_B_Jefe_de_brigada',        basico: 1_538_297, noRemunerativo:  57_400 },
  { codigo: 'CAT7_4EST_A_Jefe_de_brigada',        basico: 1_840_959, noRemunerativo:  68_700 },
  { codigo: 'CAT7_5EST_Jefe_de_brigada',          basico: 1_970_475, noRemunerativo:  73_500 },
];

type Periodo = {
  label: string;
  desde: Date;
  hasta: Date | null;
  escalas: EscalaRef[];
};

const PERIODOS: Periodo[] = [
  { label: 'Abril 2026',  desde: new Date('2026-04-01'), hasta: new Date('2026-04-30'), escalas: ABRIL_2026 },
  { label: 'Mayo 2026',   desde: new Date('2026-05-01'), hasta: new Date('2026-05-31'), escalas: MAYO_2026  },
  { label: 'Junio 2026',  desde: new Date('2026-06-01'), hasta: new Date('2026-06-30'), escalas: JUNIO_2026 },
];

async function main() {
  // 1. Cargar convenios CCT 389/04
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, '389/04'));

  if (convenios.length === 0) {
    console.log('No hay convenios CCT 389/04. Ejecutar seed-gastronomico-categorias.ts primero.');
    return;
  }

  console.log(`Procesando ${convenios.length} convenios CCT 389/04...`);

  let totalInsertadas = 0;
  let totalCategorias = 0;

  // 2. Procesar un convenio a la vez para evitar queries con demasiados params
  for (const conv of convenios) {
    // 2a. Cargar categorías de este convenio (máx 33 filas)
    const categorias = await db
      .select({
        id: payrollConvenioCategoria.id,
        codigo: payrollConvenioCategoria.codigo,
      })
      .from(payrollConvenioCategoria)
      .where(eq(payrollConvenioCategoria.convenioId, conv.id));

    if (categorias.length === 0) continue;
    totalCategorias += categorias.length;

    const byCodigo = new Map(categorias.map((c) => [c.codigo, c.id]));
    const categoriaIds = categorias.map((c) => c.id);

    // 2b. Borrar escalas existentes de este convenio
    await db.delete(payrollEscala).where(inArray(payrollEscala.categoriaId, categoriaIds));

    // 2c. Construir filas a insertar para este convenio
    const rows = [];
    for (const periodo of PERIODOS) {
      for (const ref of periodo.escalas) {
        const categoriaId = byCodigo.get(ref.codigo);
        if (!categoriaId) continue;
        rows.push({
          categoriaId,
          vigenciaDesde: periodo.desde,
          vigenciaHasta: periodo.hasta,
          montoBasico: String(ref.basico),
          montoNoRemunerativo: String(ref.noRemunerativo),
          periodoLabel: periodo.label,
          fuente: SOURCE_URL,
        });
      }
    }

    // 2d. Insert fila por fila (conexión remota inestable)
    const BATCH_SIZE = 1;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db.insert(payrollEscala).values(rows.slice(i, i + BATCH_SIZE));
    }
    totalInsertadas += rows.length;
    process.stdout.write(`  Convenio ${conv.id.slice(0, 8)}... ${rows.length} escalas OK\n`);
  }

  console.log(
    `[ok] Convenios: ${convenios.length} | Categorías: ${totalCategorias} | Escalas insertadas: ${totalInsertadas}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
