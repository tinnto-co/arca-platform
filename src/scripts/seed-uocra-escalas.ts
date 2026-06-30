/**
 * Seed categorías y escalas UOCRA (CCT 76/75) por zona geográfica.
 * Carga las 4 zonas (A, B, C, C Austral) con valores Marzo–Agosto 2026.
 * Uso: bun run src/scripts/seed-uocra-escalas.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const ZONAS = [
  { prefijo: 'Zona A',        cod: 'A'  },
  { prefijo: 'Zona B',        cod: 'B'  },
  { prefijo: 'Zona C',        cod: 'C'  },
  { prefijo: 'Zona C Austral', cod: 'CA' },
];

const CATS = [
  { sufijo: 'Oficial Especializado', cod: '01' },
  { sufijo: 'Oficial',               cod: '02' },
  { sufijo: 'Medio Oficial',         cod: '03' },
  { sufijo: 'Ayudante',              cod: '04' },
  { sufijo: 'Sereno',                cod: '05' },
];

// valor_hora para 01-04; valor_mensual para 05 (Sereno)
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

async function main() {
  const convenios = await sql`
    SELECT pc.id, cl.name AS empresa
    FROM payroll_convenio pc
    JOIN client cl ON pc.client_id = cl.id
    WHERE pc.cct_codigo = '76/75'
    ORDER BY cl.name
  `;

  console.log(`\n── Limpiando ${convenios.length} convenios UOCRA... ──`);
  for (const conv of convenios) {
    const cats = await sql`SELECT id FROM payroll_convenio_categoria WHERE convenio_id = ${conv.id}`;
    for (const cat of cats) {
      await sql`DELETE FROM payroll_escala WHERE categoria_id = ${cat.id}`;
    }
    await sql`DELETE FROM payroll_convenio_categoria WHERE convenio_id = ${conv.id}`;
  }
  console.log('  ✓ Limpieza completa\n');

  let catCreadas = 0;
  let escalasCargadas = 0;

  for (const conv of convenios) {
    console.log(`── ${conv.empresa} ──`);
    let orden = 1;

    for (const zona of ZONAS) {
      for (const cat of CATS) {
        const nombre = `${zona.prefijo} - ${cat.sufijo}`;
        const codigo = `${zona.cod}-${cat.cod}`;

        const [newCat] = await sql`
          INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre, orden, created_at, updated_at)
          VALUES (${conv.id}, ${codigo}, ${nombre}, ${orden}, NOW(), NOW())
          RETURNING id
        `;
        catCreadas++;
        orden++;

        const escalas = ESCALAS_POR_ZONA[zona.cod];
        for (const esc of escalas) {
          const monto = esc.m[cat.cod as keyof typeof esc.m];
          await sql`
            INSERT INTO payroll_escala (categoria_id, vigencia_desde, vigencia_hasta, monto_basico, periodo_label, fuente, created_at, updated_at)
            VALUES (${newCat.id}, ${esc.desde}, ${esc.hasta}, ${monto}, ${esc.label}, ${'CCT 76/75 ' + zona.prefijo}, NOW(), NOW())
          `;
          escalasCargadas++;
        }
      }
    }
    console.log(`  ✓ ${ZONAS.length * CATS.length} categorías`);
  }

  console.log('\n══ RESUMEN ══');
  console.log(`Convenios procesados: ${convenios.length}`);
  console.log(`Categorías creadas:   ${catCreadas} (${ZONAS.length} zonas × ${CATS.length} cats × ${convenios.length} empresas)`);
  console.log(`Escalas cargadas:     ${escalasCargadas}`);

  await sql.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
