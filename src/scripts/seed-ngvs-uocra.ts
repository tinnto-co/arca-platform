/**
 * Seed categorías UOCRA para NGVS y asigna convenio + categoría a empleados de construcción.
 * Uso: bun run src/scripts/seed-ngvs-uocra.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const ZONAS = [
  { prefijo: 'Zona A',         cod: 'A'  },
  { prefijo: 'Zona B',         cod: 'B'  },
  { prefijo: 'Zona C',         cod: 'C'  },
  { prefijo: 'Zona C Austral', cod: 'CA' },
];
const CATS = [
  { sufijo: 'Oficial Especializado', cod: '01' },
  { sufijo: 'Oficial',               cod: '02' },
  { sufijo: 'Medio Oficial',         cod: '03' },
  { sufijo: 'Ayudante',              cod: '04' },
  { sufijo: 'Sereno',                cod: '05' },
];

const ESC_A = [
  { desde: '2026-03-01', hasta: '2026-03-31', label: 'Marzo 2026',  m: { '01': 5579,  '02': 4773,  '03': 4411,  '04': 4060,  '05': 737493  } },
  { desde: '2026-04-01', hasta: '2026-04-30', label: 'Abril 2026',  m: { '01': 6011,  '02': 5142,  '03': 4752,  '04': 4374,  '05': 794575  } },
  { desde: '2026-05-01', hasta: '2026-05-31', label: 'Mayo 2026',   m: { '01': 6119,  '02': 5235,  '03': 4837,  '04': 4452,  '05': 808877  } },
  { desde: '2026-06-01', hasta: '2026-06-30', label: 'Junio 2026',  m: { '01': 6666,  '02': 5703,  '03': 5270,  '04': 4851,  '05': 881193  } },
  { desde: '2026-07-01', hasta: '2026-07-31', label: 'Julio 2026',  m: { '01': 6800,  '02': 5817,  '03': 5375,  '04': 4948,  '05': 898817  } },
  { desde: '2026-08-01', hasta: '2026-08-31', label: 'Agosto 2026', m: { '01': 7420,  '02': 6348,  '03': 5866,  '04': 5399,  '05': 980858  } },
];
const ESC_B = [
  { desde: '2026-03-01', hasta: '2026-03-31', label: 'Marzo 2026',  m: { '01': 6193,  '02': 5300,  '03': 4889,  '04': 4527,  '05': 821599  } },
  { desde: '2026-04-01', hasta: '2026-04-30', label: 'Abril 2026',  m: { '01': 6672,  '02': 5711,  '03': 5267,  '04': 4877,  '05': 885191  } },
  { desde: '2026-05-01', hasta: '2026-05-31', label: 'Mayo 2026',   m: { '01': 6792,  '02': 5813,  '03': 5362,  '04': 4965,  '05': 901124  } },
  { desde: '2026-06-01', hasta: '2026-06-30', label: 'Junio 2026',  m: { '01': 7400,  '02': 6333,  '03': 5842,  '04': 5409,  '05': 981688  } },
  { desde: '2026-07-01', hasta: '2026-07-31', label: 'Julio 2026',  m: { '01': 7548,  '02': 6460,  '03': 5958,  '04': 5517,  '05': 1001322 } },
  { desde: '2026-08-01', hasta: '2026-08-31', label: 'Agosto 2026', m: { '01': 8237,  '02': 7049,  '03': 6502,  '04': 6020,  '05': 1092719 } },
];
const ESC_C = [
  { desde: '2026-03-01', hasta: '2026-03-31', label: 'Marzo 2026',  m: { '01': 8565,  '02': 8030,  '03': 7749,  '04': 7524,  '05': 1232928 } },
  { desde: '2026-04-01', hasta: '2026-04-30', label: 'Abril 2026',  m: { '01': 9228,  '02': 8652,  '03': 8349,  '04': 8107,  '05': 1328356 } },
  { desde: '2026-05-01', hasta: '2026-05-31', label: 'Mayo 2026',   m: { '01': 9394,  '02': 8808,  '03': 8499,  '04': 8252,  '05': 1352267 } },
  { desde: '2026-06-01', hasta: '2026-06-30', label: 'Junio 2026',  m: { '01': 10234, '02': 9595,  '03': 9259,  '04': 8990,  '05': 1473164 } },
  { desde: '2026-07-01', hasta: '2026-07-31', label: 'Julio 2026',  m: { '01': 10439, '02': 9787,  '03': 9444,  '04': 9170,  '05': 1502627 } },
  { desde: '2026-08-01', hasta: '2026-08-31', label: 'Agosto 2026', m: { '01': 11392, '02': 10680, '03': 10306, '04': 10007, '05': 1639782 } },
];
const ESC_CA = [
  { desde: '2026-03-01', hasta: '2026-03-31', label: 'Marzo 2026',  m: { '01': 11158, '02': 9545,  '03': 8821,  '04': 8119,  '05': 1474985 } },
  { desde: '2026-04-01', hasta: '2026-04-30', label: 'Abril 2026',  m: { '01': 12022, '02': 10284, '03': 9504,  '04': 8747,  '05': 1589149 } },
  { desde: '2026-05-01', hasta: '2026-05-31', label: 'Mayo 2026',   m: { '01': 12238, '02': 10469, '03': 9675,  '04': 8905,  '05': 1617754 } },
  { desde: '2026-06-01', hasta: '2026-06-30', label: 'Junio 2026',  m: { '01': 13333, '02': 11405, '03': 10540, '04': 9701,  '05': 1762386 } },
  { desde: '2026-07-01', hasta: '2026-07-31', label: 'Julio 2026',  m: { '01': 13599, '02': 11633, '03': 10750, '04': 9895,  '05': 1797634 } },
  { desde: '2026-08-01', hasta: '2026-08-31', label: 'Agosto 2026', m: { '01': 14841, '02': 12695, '03': 11732, '04': 10798, '05': 1961716 } },
];
const ESCALAS_POR_ZONA: Record<string, typeof ESC_A> = { A: ESC_A, B: ESC_B, C: ESC_C, CA: ESC_CA };

const MAPA_CAT: Record<string, string> = {
  'oficial especializado': 'A-01',
  'oficial':               'A-02',
  'medio oficial':         'A-03',
  'ayudante':              'A-04',
  'sereno':                'A-05',
};

async function main() {
  // 1. Obtener convenio UOCRA de NGVS
  const [conv] = await sql`
    SELECT pc.id FROM payroll_convenio pc
    JOIN client cl ON pc.client_id = cl.id
    WHERE UPPER(cl.name) LIKE '%NGVS%' AND pc.cct_codigo = '76/75'
  `;
  console.log(`Convenio UOCRA NGVS: ${conv.id}`);

  // 2. Seed categorías y escalas
  let catCreadas = 0, escCreadas = 0, orden = 1;
  for (const zona of ZONAS) {
    for (const cat of CATS) {
      const nombre = `${zona.prefijo} - ${cat.sufijo}`;
      const codigo = `${zona.cod}-${cat.cod}`;
      const [existing] = await sql`
        SELECT id FROM payroll_convenio_categoria WHERE convenio_id = ${conv.id} AND codigo = ${codigo}
      `;
      if (!existing) {
        const [newCat] = await sql`
          INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre, orden, created_at, updated_at)
          VALUES (${conv.id}, ${codigo}, ${nombre}, ${orden}, NOW(), NOW())
          RETURNING id
        `;
        catCreadas++;
        for (const esc of ESCALAS_POR_ZONA[zona.cod]) {
          const monto = esc.m[cat.cod as keyof typeof esc.m];
          await sql`
            INSERT INTO payroll_escala (categoria_id, vigencia_desde, vigencia_hasta, monto_basico, periodo_label, fuente, created_at, updated_at)
            VALUES (${newCat.id}, ${esc.desde}, ${esc.hasta}, ${monto}, ${esc.label}, ${'CCT 76/75 ' + zona.prefijo}, NOW(), NOW())
          `;
          escCreadas++;
        }
      }
      orden++;
    }
  }
  console.log(`✓ ${catCreadas} categorías y ${escCreadas} escalas creadas`);

  // 3. Asignar empleados UOCRA
  const emps = await sql`
    SELECT e.id, e.cuil, e.nombre, e.categoria
    FROM liquidacion_import_empleado e
    JOIN client cl ON e.client_id = cl.id
    WHERE UPPER(cl.name) LIKE '%NGVS%'
      AND e.activo = true
      AND e.convenio_id IS NULL
  `;

  console.log(`\nEmpleados sin convenio en NGVS: ${emps.length}`);
  let asignados = 0, sinMatch = 0;

  for (const e of emps) {
    const catTexto = (e.categoria ?? '').toLowerCase().trim();
    const cod = MAPA_CAT[catTexto];
    if (!cod) {
      console.log(`  ⚠ Sin match: ${e.nombre} | categoria="${e.categoria}"`);
      sinMatch++;
      continue;
    }
    const [cat] = await sql`
      SELECT id FROM payroll_convenio_categoria WHERE convenio_id = ${conv.id} AND codigo = ${cod}
    `;
    await sql`
      UPDATE liquidacion_import_empleado
      SET convenio_id = ${conv.id}, categoria_id = ${cat.id}, updated_at = NOW()
      WHERE id = ${e.id}
    `;
    console.log(`  ✓ ${e.nombre} → ${cod}`);
    asignados++;
  }

  console.log(`\nAsignados: ${asignados} | Sin match: ${sinMatch}`);
  await sql.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
