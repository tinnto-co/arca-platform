/**
 * Recorre todos los empleados de liquidacion_import_empleado que tienen texto
 * en el campo `categoria` y pertenecen a un convenio CCT 130/75, y enlaza
 * su categoria_id con el registro correspondiente de payroll_convenio_categoria
 * usando empleados_categorias como tabla canónica de mapeo.
 *
 * Idempotente: si ya tiene categoria_id correcto, no lo modifica.
 *
 * Uso: bun run src/scripts/link-empleados-categorias.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

// Aliases: variantes de texto → código canónico
const ALIASES: Record<string, string> = {
  'auxiliar a':             'AUX_A',
  'auxiliar b':             'AUX_B',
  'auxiliar c':             'AUX_C',
  'aux especializado a':    'AUESP_A',
  'aux especializado b':    'AUESP_B',
  'administrativa a':       'ADM_A',
  'administrativa b':       'ADM_B',
  'administrativo a':       'ADM_A',
  'administrativo b':       'ADM_B',
  'administrativo c':       'ADM_C',
  'administrativo d':       'ADM_D',
  'administrativo e':       'ADM_E',
  'administrativo f':       'ADM_F',
  'vendedor a':             'VEN_A',
  'vendedor b':             'VEN_B',
  'vendedor c':             'VEN_C',
  'vendedor d':             'VEN_D',
  'vendedor categoria a':   'VEN_A',
  'vendedores a':           'VEN_A',
  'vendedores b':           'VEN_B',
  'vendedores c':           'VEN_C',
  'vendedores d':           'VEN_D',
  'cajero a':               'CAJ_A',
  'cajero b':               'CAJ_B',
  'cajeros a':              'CAJ_A',
  'cajeros b':              'CAJ_B',
  'cajeros c':              'CAJ_C',
  'personal auxiliar a':    'AUX_A',
  'personal auxiliar b':    'AUX_B',
  'personal auxiliar c':    'AUX_C',
  'maestranza a':           'MA_A',
  'maestranza b':           'MA_B',
  'maestranza c':           'MA_C',
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

async function main() {
  // 1. Cargar categorías canónicas de empleados_categorias (CCT 130/75)
  const catCanon = await sql`
    SELECT codigo, nombre FROM empleados_categorias WHERE cct_codigo = '130/75'
  `;
  // Construir mapa norm(nombre) → codigo
  const mapaTexto = new Map<string, string>();
  for (const c of catCanon) mapaTexto.set(norm(c.nombre), c.codigo);
  // Agregar aliases
  for (const [alias, codigo] of Object.entries(ALIASES)) mapaTexto.set(alias, codigo);

  // 2. Cargar todos los empleados con categoria texto y convenio 130/75
  const empleados = await sql`
    SELECT
      e.id, e.nombre, e.categoria, e.convenio_id, e.categoria_id, e.valor_sueldo,
      p.name as empresa
    FROM liquidacion_import_empleado e
    JOIN profile p ON p.id = e.profile_id
    JOIN payroll_convenio pc ON pc.id = e.convenio_id
    WHERE e.categoria IS NOT NULL
      AND pc.cct_codigo = '130/75'
    ORDER BY p.name, e.nombre
  `;
  console.log(`Empleados con categoria texto en CCT 130/75: ${empleados.length}`);

  // 3. Cargar mapa convenioId:CODIGO → pcc.id
  const pccRows = await sql`
    SELECT pcc.id, pcc.codigo, pcc.convenio_id
    FROM payroll_convenio_categoria pcc
    JOIN payroll_convenio pc ON pc.id = pcc.convenio_id
    WHERE pc.cct_codigo = '130/75'
  `;
  const catMap = new Map<string, string>();
  for (const c of pccRows) catMap.set(`${c.convenio_id}:${c.codigo}`, c.id);

  // 4. Escala Marzo 2026 por código para detectar overrides estándar
  const escalas = await sql`
    SELECT DISTINCT pcc.codigo, pe.monto_basico::numeric::integer as monto
    FROM payroll_escala pe
    JOIN payroll_convenio_categoria pcc ON pcc.id = pe.categoria_id
    JOIN payroll_convenio pc ON pc.id = pcc.convenio_id
    WHERE pc.cct_codigo = '130/75' AND pe.periodo_label = 'Marzo 2026 (resumen)'
  `;
  const escalaMarzo = new Map<string, number>();
  for (const e of escalas) escalaMarzo.set(e.codigo, Number(e.monto));

  // 5. Procesar cada empleado
  let actualizados = 0, yaCorrectos = 0, sinMatch = 0;
  const noMatchLog: string[] = [];

  for (const e of empleados) {
    const codigo = mapaTexto.get(norm(e.categoria));
    if (!codigo) {
      sinMatch++;
      noMatchLog.push(`  [${e.empresa}] ${e.nombre} | "${e.categoria}"`);
      continue;
    }

    const categoriaId = catMap.get(`${e.convenio_id}:${codigo}`);
    if (!categoriaId) {
      sinMatch++;
      noMatchLog.push(`  [${e.empresa}] ${e.nombre} | "${e.categoria}" → ${codigo} (sin pcc para este convenio)`);
      continue;
    }

    // Ya tiene la categoria correcta
    if (e.categoria_id === categoriaId) { yaCorrectos++; continue; }

    const overrideActual = e.valor_sueldo ? Math.round(Number(e.valor_sueldo)) : null;
    const montoMarzo = escalaMarzo.get(codigo);
    const limpiarOverride = overrideActual !== null && montoMarzo !== undefined && overrideActual === montoMarzo;

    if (limpiarOverride) {
      await sql`UPDATE liquidacion_import_empleado SET categoria_id = ${categoriaId}, valor_sueldo = NULL WHERE id = ${e.id}`;
    } else {
      await sql`UPDATE liquidacion_import_empleado SET categoria_id = ${categoriaId} WHERE id = ${e.id}`;
    }

    console.log(`[${limpiarOverride ? 'OK+limpio' : 'OK+override'}] [${e.empresa}] ${e.nombre} | "${e.categoria}" → ${codigo}${overrideActual && !limpiarOverride ? ` (override $${overrideActual} mantenido)` : ''}`);
    actualizados++;
  }

  console.log(`\n── Resultado ──`);
  console.log(`Actualizados: ${actualizados} | Ya correctos: ${yaCorrectos} | Sin match: ${sinMatch}`);
  if (noMatchLog.length > 0) {
    console.log(`\nSin match (revisar manualmente):`);
    for (const l of noMatchLog) console.log(l);
  }
}

main().then(() => { sql.end(); process.exit(0); }).catch(e => { console.error(e); sql.end(); process.exit(1); });
