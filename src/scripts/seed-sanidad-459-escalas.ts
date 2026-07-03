/**
 * Seed categorías y escalas CCT 459/06 — Sanidad / Emergencias Médicas.
 * Carga 8 categorías (I-A a VI) con escalas Feb–Abr 2026 para todas las empresas con este convenio.
 * Uso: bun run src/scripts/seed-sanidad-459-escalas.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const CATEGORIAS = [
  { codigo: 'I-A',  nombre: 'Categoría I-A',  orden: 1 },
  { codigo: 'I-B',  nombre: 'Categoría I-B',  orden: 2 },
  { codigo: 'II-A', nombre: 'Categoría II-A', orden: 3 },
  { codigo: 'II-B', nombre: 'Categoría II-B', orden: 4 },
  { codigo: 'III',  nombre: 'Categoría III',  orden: 5 },
  { codigo: 'IV',   nombre: 'Categoría IV',   orden: 6 },
  { codigo: 'V',    nombre: 'Categoría V',    orden: 7 },
  { codigo: 'VI',   nombre: 'Categoría VI',   orden: 8 },
];

// Escalas Feb–Abr 2026 (acuerdo 01/02/2026–31/01/2027)
const ESCALAS = [
  { desde: '2026-02-01', hasta: '2026-02-28', label: 'Febrero 2026', m: { 'I-A': 1522102, 'I-B': 1207538, 'II-A': 1167515, 'II-B': 1123015, 'III': 1102438, 'IV': 1059811, 'V': 955447,  'VI': 898392 } },
  { desde: '2026-03-01', hasta: '2026-03-31', label: 'Marzo 2026',   m: { 'I-A': 1547977, 'I-B': 1228067, 'II-A': 1187363, 'II-B': 1142106, 'III': 1121179, 'IV': 1077828, 'V': 971690,  'VI': 913664 } },
  { desde: '2026-04-01', hasta: '2026-04-30', label: 'Abril 2026',   m: { 'I-A': 1572745, 'I-B': 1247716, 'II-A': 1206361, 'II-B': 1160380, 'III': 1139118, 'IV': 1095073, 'V': 987237,  'VI': 928283 } },
];

async function main() {
  const convenios = await sql`
    SELECT pc.id, cl.name AS empresa
    FROM payroll_convenio pc
    JOIN client cl ON pc.client_id = cl.id
    WHERE pc.cct_codigo = '459/06'
    ORDER BY cl.name
  `;

  console.log(`Convenios 459/06 a procesar: ${convenios.length}`);

  let catCreadas = 0, escalasCargadas = 0, escalasActualizadas = 0;

  for (const conv of convenios) {
    console.log(`\n── ${conv.empresa} ──`);

    for (const cat of CATEGORIAS) {
      let [row] = await sql`
        SELECT id FROM payroll_convenio_categoria
        WHERE convenio_id = ${conv.id} AND codigo = ${cat.codigo}
      `;
      if (!row) {
        [row] = await sql`
          INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre, orden, created_at, updated_at)
          VALUES (${conv.id}, ${cat.codigo}, ${cat.nombre}, ${cat.orden}, NOW(), NOW())
          RETURNING id
        `;
        catCreadas++;
        console.log(`  + ${cat.nombre}`);
      }

      for (const esc of ESCALAS) {
        const monto = esc.m[cat.codigo as keyof typeof esc.m];
        const [existing] = await sql`
          SELECT id FROM payroll_escala WHERE categoria_id = ${row.id} AND vigencia_desde = ${esc.desde}
        `;
        if (existing) {
          await sql`
            UPDATE payroll_escala SET monto_basico = ${monto}, periodo_label = ${esc.label},
              fuente = 'CCT 459/06 Sanidad', updated_at = NOW()
            WHERE id = ${existing.id}
          `;
          escalasActualizadas++;
        } else {
          await sql`
            INSERT INTO payroll_escala (categoria_id, vigencia_desde, vigencia_hasta, monto_basico, periodo_label, fuente, created_at, updated_at)
            VALUES (${row.id}, ${esc.desde}, ${esc.hasta}, ${monto}, ${esc.label}, 'CCT 459/06 Sanidad', NOW(), NOW())
          `;
          escalasCargadas++;
        }
      }
    }
  }

  console.log(`\n══ RESUMEN ══`);
  console.log(`Convenios procesados: ${convenios.length}`);
  console.log(`Categorías creadas:   ${catCreadas}`);
  console.log(`Escalas insertadas:   ${escalasCargadas}`);
  console.log(`Escalas actualizadas: ${escalasActualizadas}`);

  await sql.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
