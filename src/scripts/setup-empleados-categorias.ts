/**
 * Crea la tabla empleados_categorias y la puebla con las categorías
 * importadas de estudiovilaplana (Comercio CCT 130/75).
 * Luego matchea empleados por texto de categoria y asigna categoria_id.
 *
 * Uso: bun run src/scripts/setup-empleados-categorias.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const FUENTE = 'https://estudiovilaplana.com.ar/escala-salarial-empleados-comercio/';

const CATEGORIAS_COMERCIO = [
  { codigo: 'MA_A',    nombre: 'Maestranza A'             },
  { codigo: 'MA_B',    nombre: 'Maestranza B'             },
  { codigo: 'MA_C',    nombre: 'Maestranza C'             },
  { codigo: 'ADM_A',   nombre: 'Administrativo A'         },
  { codigo: 'ADM_B',   nombre: 'Administrativo B'         },
  { codigo: 'ADM_C',   nombre: 'Administrativo C'         },
  { codigo: 'ADM_D',   nombre: 'Administrativo D'         },
  { codigo: 'ADM_E',   nombre: 'Administrativo E'         },
  { codigo: 'ADM_F',   nombre: 'Administrativo F'         },
  { codigo: 'CAJ_A',   nombre: 'Cajeros A'                },
  { codigo: 'CAJ_B',   nombre: 'Cajeros B'                },
  { codigo: 'CAJ_C',   nombre: 'Cajeros C'                },
  { codigo: 'AUX_A',   nombre: 'Personal Auxiliar A'      },
  { codigo: 'AUX_B',   nombre: 'Personal Auxiliar B'      },
  { codigo: 'AUX_C',   nombre: 'Personal Auxiliar C'      },
  { codigo: 'AUESP_A', nombre: 'Auxiliar Especializado A' },
  { codigo: 'AUESP_B', nombre: 'Auxiliar Especializado B' },
  { codigo: 'VEN_A',   nombre: 'Vendedores A'             },
  { codigo: 'VEN_B',   nombre: 'Vendedores B'             },
  { codigo: 'VEN_C',   nombre: 'Vendedores C'             },
  { codigo: 'VEN_D',   nombre: 'Vendedores D'             },
];

// Aliases: variantes de texto que deben mapear a un código
const ALIASES: { alias: string; codigo: string }[] = [
  { alias: 'Auxiliar A',            codigo: 'AUX_A'    },
  { alias: 'Auxiliar B',            codigo: 'AUX_B'    },
  { alias: 'Auxiliar C',            codigo: 'AUX_C'    },
  { alias: 'Aux Especializado A',   codigo: 'AUESP_A'  },
  { alias: 'Aux Especializado B',   codigo: 'AUESP_B'  },
  { alias: 'Administrativa A',      codigo: 'ADM_A'    },
  { alias: 'Administrativa B',      codigo: 'ADM_B'    },
  { alias: 'Vendedor A',            codigo: 'VEN_A'    },
  { alias: 'Vendedor B',            codigo: 'VEN_B'    },
  { alias: 'Vendedor C',            codigo: 'VEN_C'    },
  { alias: 'Vendedor D',            codigo: 'VEN_D'    },
  { alias: 'Vendedor Categoria A',  codigo: 'VEN_A'    },
  { alias: 'Cajero A',              codigo: 'CAJ_A'    },
  { alias: 'Cajero B',              codigo: 'CAJ_B'    },
];

function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

async function main() {
  // ── 1. Crear tabla ──────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS empleados_categorias (
      id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo      text    NOT NULL,
      nombre      text    NOT NULL,
      cct_codigo  text    NOT NULL,
      fuente      text,
      created_at  timestamp DEFAULT now(),
      UNIQUE (codigo, cct_codigo)
    )
  `;
  console.log('[ok] Tabla empleados_categorias lista.');

  // ── 2. Insertar/actualizar categorías canónicas ─────────────────────────────
  for (const c of CATEGORIAS_COMERCIO) {
    await sql`
      INSERT INTO empleados_categorias (codigo, nombre, cct_codigo, fuente)
      VALUES (${c.codigo}, ${c.nombre}, '130/75', ${FUENTE})
      ON CONFLICT (codigo, cct_codigo) DO UPDATE
        SET nombre = EXCLUDED.nombre, fuente = EXCLUDED.fuente
    `;
  }
  console.log(`[ok] ${CATEGORIAS_COMERCIO.length} categorías Comercio 130/75 cargadas.`);

  // ── 3. Construir mapa de normalización: texto_norm → codigo ─────────────────
  const mapaTexto = new Map<string, string>();
  for (const c of CATEGORIAS_COMERCIO) mapaTexto.set(norm(c.nombre), c.codigo);
  for (const a of ALIASES) mapaTexto.set(norm(a.alias), a.codigo);

  // ── 4. Asignar convenio_id a empleados sin él cuya empresa tiene CCT 130/75 ──
  // Solo si la empresa tiene exactamente un convenio 130/75 (sin ambigüedad)
  const asignados = await sql`
    UPDATE liquidacion_import_empleado e
    SET convenio_id = sub.convenio_id
    FROM (
      SELECT p.id as profile_id, pc.id as convenio_id
      FROM profile p
      JOIN client c ON c.id = p.client_id
      JOIN payroll_convenio pc ON pc.client_id = c.id AND pc.cct_codigo = '130/75'
    ) sub
    WHERE e.profile_id = sub.profile_id
      AND e.convenio_id IS NULL
      AND e.categoria IS NOT NULL
      AND e.categoria_id IS NULL
    RETURNING e.id, e.nombre
  `;
  if (asignados.length > 0) {
    console.log(`[ok] convenio_id asignado a ${asignados.length} empleados sin convenio:`);
    for (const r of asignados) console.log(`  - ${r.nombre}`);
  }

  // ── 5. Cargar empleados sin categoria_id con convenio Comercio ──────────────
  const empleados = await sql`
    SELECT e.id, e.nombre, e.categoria, e.convenio_id, e.valor_sueldo
    FROM liquidacion_import_empleado e
    JOIN payroll_convenio pc ON pc.id = e.convenio_id
    WHERE e.categoria_id IS NULL
      AND pc.cct_codigo = '130/75'
      AND e.categoria IS NOT NULL
  `;

  // ── 6. Cargar categorías de payroll_convenio_categoria por convenio ──────────
  const cats = await sql`
    SELECT pcc.id, pcc.codigo, pcc.convenio_id
    FROM payroll_convenio_categoria pcc
    JOIN payroll_convenio pc ON pc.id = pcc.convenio_id
    WHERE pc.cct_codigo = '130/75'
  `;
  const catMap = new Map<string, string>(); // convenioId:CODIGO → pcc.id
  for (const c of cats) catMap.set(`${c.convenio_id}:${c.codigo}`, c.id);

  // ── 6. Escalas Marzo 2026 para saber si el override es el monto de escala ───
  const escalas = await sql`
    SELECT DISTINCT monto_basico::numeric::integer as monto, pcc.codigo
    FROM payroll_escala pe
    JOIN payroll_convenio_categoria pcc ON pcc.id = pe.categoria_id
    JOIN payroll_convenio pc ON pc.id = pcc.convenio_id
    WHERE pc.cct_codigo = '130/75'
      AND pe.periodo_label = 'Marzo 2026 (resumen)'
  `;
  const escalaMap = new Map<string, number>(); // codigo → monto marzo
  for (const e of escalas) escalaMap.set(e.codigo, Number(e.monto));

  // ── 7. Matchear y actualizar ─────────────────────────────────────────────────
  let matches = 0, sinMatch = 0;

  for (const e of empleados) {
    const catNorm = norm(e.categoria);
    const codigo = mapaTexto.get(catNorm);
    if (!codigo) { sinMatch++; continue; }

    const categoriaId = catMap.get(`${e.convenio_id}:${codigo}`);
    if (!categoriaId) { sinMatch++; continue; }

    const overrideActual = e.valor_sueldo ? Math.round(Number(e.valor_sueldo)) : null;
    const escalaMarzo = escalaMap.get(codigo);
    const limpiarOverride = overrideActual !== null && escalaMarzo !== undefined && overrideActual === escalaMarzo;

    if (limpiarOverride) {
      await sql`UPDATE liquidacion_import_empleado SET categoria_id = ${categoriaId}, valor_sueldo = NULL WHERE id = ${e.id}`;
    } else {
      await sql`UPDATE liquidacion_import_empleado SET categoria_id = ${categoriaId} WHERE id = ${e.id}`;
    }

    console.log(`[${limpiarOverride ? 'OK+limpio' : 'OK+override'}] ${e.nombre} → ${codigo} | override: ${overrideActual ?? 'null'}`);
    matches++;
  }

  console.log(`\n[ok] Matches aplicados: ${matches} | Sin match: ${sinMatch}`);
}

main().then(() => { sql.end(); process.exit(0); }).catch(e => { console.error(e); sql.end(); process.exit(1); });
