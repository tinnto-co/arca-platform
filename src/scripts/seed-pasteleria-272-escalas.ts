/**
 * Seed categorías y escalas CCT 272/96 — Pastelería (CABA/PBA).
 * Carga 30 categorías (3 jornadas × 10 categorías) con escala Marzo 2026.
 * Luego asigna empleados según campo `categoria` y jornada deducida de `horas_mensuales_normales`.
 * Uso: bun run src/scripts/seed-pasteleria-272-escalas.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// ── Jornadas ──────────────────────────────────────────────────────────────────
// Rangos aproximados: 7hs×30=210, 8hs×30=240, 9h36×30=288
const JORNADAS = [
  { prefijo: '7hs',  cod: '7H',  horasMin: 170, horasMax: 224 },
  { prefijo: '8hs',  cod: '8H',  horasMin: 225, horasMax: 264 },
  { prefijo: '9h36', cod: '9H',  horasMin: 265, horasMax: 999 },
];

// ── Categorías CCT 272/96 ────────────────────────────────────────────────────
const CATEGORIAS = [
  { cod: '01', nombre: 'Maestro Pastelero / Encargado de Cocina' },
  { cod: '02', nombre: 'Cocinero / Segundo Pastelero / Hornero / Encargado Servicios y Eventos' },
  { cod: '03', nombre: 'Oficial de Sección / Oficial Mantenimiento / Segundo Cocinero' },
  { cod: '04', nombre: 'Oficial de Mesa / 1° Vendedor / Sandwichero / Empleado Administrativo / Cajero' },
  { cod: '05', nombre: 'Medio Oficial / 2° Vendedor / Oficial Bañador Bombones / Minutero' },
  { cod: '06', nombre: 'Ayudante Pastelero / Ayudante Sandwichero / Ayudante Cocina / Dependiente de Salón' },
  { cod: '07', nombre: 'Suplente de Ventas / Medio Oficial Bañador Bombones / Preparador Caja Bombones' },
  { cod: '08', nombre: 'Peón de Limpieza / Carga y Descarga / Aprendiz Inicial / Repartidor a Domicilio' },
  { cod: '09', nombre: 'Aprendiz (a los 10 meses)' },
  { cod: '10', nombre: 'Aprendiz (a los 24 meses)' },
];

// ── Escalas Marzo 2026 por categoría (cod) y jornada ────────────────────────
// [7hs, 8hs, 9h36]
const MONTOS_MARZO: Record<string, { '7H': number; '8H': number; '9H': number }> = {
  '01': { '7H': 2047639, '8H': 2415258, '9H': 2661545 },
  '02': { '7H': 1606311, '8H': 1895530, '9H': 2087312 },
  '03': { '7H': 1449704, '8H': 1710654, '9H': 1884601 },
  '04': { '7H': 1399297, '8H': 1650224, '9H': 1818731 },
  '05': { '7H': 1299512, '8H': 1535612, '9H': 1691117 },
  '06': { '7H': 1224028, '8H': 1444937, '9H': 1592385 },
  '07': { '7H': 1224028, '8H': 1444937, '9H': 1592385 },
  '08': { '7H': 1199037, '8H': 1415837, '9H': 1558869 },
  '09': { '7H': 1224028, '8H': 1444937, '9H': 1592385 },
  '10': { '7H': 1299512, '8H': 1535612, '9H': 1691117 },
};

const ESCALA_MARZO = { desde: '2026-03-01', hasta: '2026-03-31', label: 'Marzo 2026' };

// ── Mapeo texto libre → código de categoría ──────────────────────────────────
// Normaliza el campo `categoria` del empleado al cod de CATEGORIAS
const MAPA_CATEGORIA: Record<string, string> = {
  'maestro pastelero':                    '01',
  'encargado de cocina':                  '01',
  'cocinero':                             '02',
  'segundo pastelero':                    '02',
  'maestro facturero':                    '02',
  'hornero':                              '02',
  'turnante':                             '02',
  'jefe sandwichero':                     '02',
  'saladitero':                           '02',
  'fiambrero':                            '02',
  'encargado servicios y eventos':        '02',
  'chofer':                               '02',
  'oficial de seccion':                   '03',
  'oficial de sección':                   '03',
  'oficial mantenimiento':                '03',
  'segundo cocinero':                     '03',
  'oficial de mesa':                      '04',
  'primer vendedor':                      '04',
  '1° vendedor':                          '04',
  'sandwichero':                          '04',
  'empleado administrativo':              '04',
  'cajero':                               '04',
  'medio oficial':                        '05',
  'segundo vendedor':                     '05',
  '2° vendedor':                          '05',
  'minutero':                             '05',
  'ayudante pastelero':                   '06',
  'ayudante sandwichero':                 '06',
  'ayudante sanguchero':                  '06',
  'ayudante cocina':                      '06',
  'ayudante vajillas':                    '06',
  'ayudante chofer':                      '06',
  'operario mantenimiento':               '06',
  'dependiente de salon':                 '06',
  'dependiente de salón':                 '06',
  'camarera':                             '06',
  'suplente de ventas':                   '07',
  'preparador caja bombones':             '07',
  'peon de limpieza':                     '08',
  'peón de limpieza':                     '08',
  'peon limpieza':                        '08',
  'peón limpieza':                        '08',
  'carga y descarga':                     '08',
  'aprendiz inicial':                     '08',
  'repartidor a domicilio':               '08',
  'aprendiz':                             '09',
};

function resolverJornada(hs: number | null): string | null {
  if (!hs) return null;
  for (const j of JORNADAS) {
    if (hs >= j.horasMin && hs <= j.horasMax) return j.cod;
  }
  return null;
}

async function main() {
  // ── PASO 1: Crear convenio 272/96 para empresas que lo tienen en AFIP y no en sistema ──
  const faltantes = await sql`
    SELECT DISTINCT cl.id AS client_id, cl.name, cl.representative_id
    FROM afip_empleadores_convenio aec
    JOIN convenios_de_trabajo cdt ON aec.convenio_id = cdt.id
    JOIN client cl ON aec.client_id = cl.id
    WHERE REGEXP_REPLACE(cdt.cct, '^0+', '') = '272/96'
      AND NOT EXISTS (
        SELECT 1 FROM payroll_convenio pc
        WHERE pc.client_id = cl.id AND pc.cct_codigo = '272/96'
      )
  `;
  for (const emp of faltantes) {
    await sql`
      INSERT INTO payroll_convenio (representative_id, client_id, nombre, cct_codigo, activo, created_at, updated_at)
      VALUES (${emp.representative_id}, ${emp.client_id}, 'Pasteleros', '272/96', true, NOW(), NOW())
    `;
    console.log(`✓ Convenio 272/96 creado: ${emp.name}`);
  }

  // ── PASO 2: Categorías y escalas para todos los convenios 272/96 ──────────
  const convenios = await sql`
    SELECT pc.id, cl.name AS empresa
    FROM payroll_convenio pc
    JOIN client cl ON pc.client_id = cl.id
    WHERE pc.cct_codigo = '272/96'
    ORDER BY cl.name
  `;

  console.log(`\nConvenios 272/96: ${convenios.length}`);
  let catCreadas = 0, escalasCreadas = 0;

  for (const conv of convenios) {
    console.log(`\n── ${conv.empresa} ──`);
    let orden = 1;

    for (const jornada of JORNADAS) {
      for (const cat of CATEGORIAS) {
        const nombre = `${jornada.prefijo} - ${cat.nombre}`;
        const codigo = `${jornada.cod}-${cat.cod}`;

        let [row] = await sql`
          SELECT id FROM payroll_convenio_categoria
          WHERE convenio_id = ${conv.id} AND codigo = ${codigo}
        `;
        if (!row) {
          [row] = await sql`
            INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre, orden, created_at, updated_at)
            VALUES (${conv.id}, ${codigo}, ${nombre}, ${orden}, NOW(), NOW())
            RETURNING id
          `;
          catCreadas++;
        }

        const monto = MONTOS_MARZO[cat.cod][jornada.cod as '7H' | '8H' | '9H'];
        const [existing] = await sql`
          SELECT id FROM payroll_escala WHERE categoria_id = ${row.id} AND vigencia_desde = ${ESCALA_MARZO.desde}
        `;
        if (!existing) {
          await sql`
            INSERT INTO payroll_escala (categoria_id, vigencia_desde, vigencia_hasta, monto_basico, periodo_label, fuente, created_at, updated_at)
            VALUES (${row.id}, ${ESCALA_MARZO.desde}, ${ESCALA_MARZO.hasta}, ${monto}, ${ESCALA_MARZO.label}, 'CCT 272/96 Pasteleros', NOW(), NOW())
          `;
          escalasCreadas++;
        }
        orden++;
      }
    }
    console.log(`  ✓ ${JORNADAS.length * CATEGORIAS.length} categorías`);
  }

  // ── PASO 3: Asignar empleados ─────────────────────────────────────────────
  console.log('\n── Asignando empleados ──');

  const emps = await sql`
    SELECT e.id, e.cuil, e.nombre, e.categoria, e.horas_mensuales_normales, e.convenio_id, pc.id AS conv_id
    FROM liquidacion_import_empleado e
    JOIN client cl ON e.client_id = cl.id
    JOIN payroll_convenio pc ON pc.client_id = cl.id AND pc.cct_codigo = '272/96'
    WHERE e.activo = true
      AND (e.convenio_id IS NULL OR e.convenio_id = pc.id)
  `;

  let asignados = 0, sinMatch = 0;

  for (const e of emps) {
    const catTexto = (e.categoria ?? '').toLowerCase().trim();
    const catCod = MAPA_CATEGORIA[catTexto];
    const jornadaCod = resolverJornada(e.horas_mensuales_normales);

    if (!catCod || !jornadaCod) {
      console.log(`  ⚠ Sin match: ${e.nombre} | categoria="${e.categoria}" | hs=${e.horas_mensuales_normales}`);
      sinMatch++;
      continue;
    }

    const codigo = `${jornadaCod}-${catCod}`;
    const [cat] = await sql`
      SELECT id FROM payroll_convenio_categoria WHERE convenio_id = ${e.conv_id} AND codigo = ${codigo}
    `;

    if (!cat) {
      console.log(`  ⚠ Categoría ${codigo} no encontrada en convenio`);
      sinMatch++;
      continue;
    }

    await sql`
      UPDATE liquidacion_import_empleado
      SET convenio_id = ${e.conv_id}, categoria_id = ${cat.id}, updated_at = NOW()
      WHERE id = ${e.id}
    `;
    console.log(`  ✓ ${e.nombre} → ${codigo} (${e.horas_mensuales_normales}hs)`);
    asignados++;
  }

  console.log(`\n══ RESUMEN ══`);
  console.log(`Convenios procesados: ${convenios.length}`);
  console.log(`Categorías creadas:   ${catCreadas}`);
  console.log(`Escalas creadas:      ${escalasCreadas}`);
  console.log(`Empleados asignados:  ${asignados} | sin match: ${sinMatch}`);

  await sql.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
