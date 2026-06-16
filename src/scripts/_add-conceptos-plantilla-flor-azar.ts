/**
 * Agrega los conceptos 7, 8, 9, 12, 103, 105, 206, 209, 411 al recibo de referencia
 * (plantilla base) de Flor de Azar, para que aparezcan pre-activados en nuevos recibos.
 *
 * Uso: bun run src/scripts/_add-conceptos-plantilla-flor-azar.ts
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import {
  client,
  liquidacionImportRecibo,
  liquidacionImportConceptoValor,
} from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';

const CODIGOS_A_AGREGAR = [7, 8, 9, 12, 103, 105, 206, 209, 411];

// Porcentajes específicos que deben venir pre-seteados
const PCT_FIJOS: Record<number, string> = {
  206: '2.5',
  209: '1',
};

// 1. Buscar el profile Flor de Azar y su plantilla
const profileRow = await db
  .select({
    id: client.id,
    name: client.name,
    plantillaEmpleadoId: client.payrollPlantillaEmpleadoId,
  })
  .from(client)
  .where(eq(client.name, 'FLOR DE AZAR S.A.'))
  .then((r) => r[0] ?? null);

if (!profileRow) {
  console.error('No se encontró FLOR DE AZAR S.A.');
  process.exit(1);
}
if (!profileRow.plantillaEmpleadoId) {
  console.error('Flor de Azar no tiene plantillaEmpleadoId configurado. Ejecutá primero _setup-plantilla-flor-azar.ts');
  process.exit(1);
}

console.log(`Profile: ${profileRow.name} (${profileRow.id})`);
console.log(`Empleado de referencia: ${profileRow.plantillaEmpleadoId}`);

// 2. Buscar el último recibo del empleado de referencia
const ultimoRecibo = await db
  .select({ id: liquidacionImportRecibo.id, periodo: liquidacionImportRecibo.periodo })
  .from(liquidacionImportRecibo)
  .where(eq(liquidacionImportRecibo.empleadoId, profileRow.plantillaEmpleadoId))
  .orderBy(desc(liquidacionImportRecibo.periodo))
  .limit(1)
  .then((r) => r[0] ?? null);

if (!ultimoRecibo) {
  console.error('El empleado de referencia no tiene recibos.');
  process.exit(1);
}

console.log(`\nÚltimo recibo: ${ultimoRecibo.periodo} (${ultimoRecibo.id})`);

// 3. Ver qué conceptos ya existen en ese recibo
const existentes = await db
  .select({ codigo: liquidacionImportConceptoValor.codigo })
  .from(liquidacionImportConceptoValor)
  .where(eq(liquidacionImportConceptoValor.reciboId, ultimoRecibo.id));

const codigosExistentes = new Set(existentes.map((e) => e.codigo));
console.log(`\nConceptos existentes en el recibo: ${[...codigosExistentes].join(', ')}`);

// 4. Insertar los faltantes
const faltantes = CODIGOS_A_AGREGAR.filter((n) => !codigosExistentes.has(String(n)));
if (faltantes.length === 0) {
  console.log('\nTodos los conceptos ya están presentes. Nada que hacer.');
  process.exit(0);
}

console.log(`\nConceptos a agregar: ${faltantes.join(', ')}`);

for (const num of faltantes) {
  const codigo = String(num);
  const pct = PCT_FIJOS[num] ?? null;
  await db.insert(liquidacionImportConceptoValor).values({
    reciboId: ultimoRecibo.id,
    codigo,
    monto: '0',
    porcentaje: pct,
    origen: 'generado',
  });
  console.log(`  + Agregado concepto ${codigo}${pct ? ` (porcentaje: ${pct}%)` : ''}`);
}

console.log('\n✓ Listo. Los nuevos recibos de Flor de Azar mostrarán esos conceptos pre-activados.');
process.exit(0);
