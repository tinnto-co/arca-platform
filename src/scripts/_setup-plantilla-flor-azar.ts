/**
 * Configura el empleado de referencia (plantilla base) para Flor de Azar.
 * Busca el profile por nombre, toma el primer empleado con recibos, y setea
 * client.payrollPlantillaEmpleadoId para que "Nuevo recibo" pre-active los conceptos.
 *
 * Uso: bun run src/scripts/_setup-plantilla-flor-azar.ts
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { client, liquidacionImportEmpleado, liquidacionImportRecibo } from '@/drizzle/schema';
import { ilike, eq, desc } from 'drizzle-orm';

// 1. Buscar el profile "Flor de Azar"
const profiles = await db
  .select({ id: client.id, name: client.name, plantillaActual: client.payrollPlantillaEmpleadoId })
  .from(client)
  .where(ilike(client.name, '%flor%azar%'));

if (profiles.length === 0) {
  console.error('No se encontró ningún profile con nombre que contenga "flor" y "azar".');
  console.log('Perfiles disponibles con sueldos:');
  const todos = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(eq(client.liquidaSueldos, true));
  todos.forEach((p) => console.log(` - ${p.name} (${p.id})`));
  process.exit(1);
}

console.log(`Profiles encontrados:`);
profiles.forEach((p) => console.log(` - ${p.name} (${p.id}) | plantilla actual: ${p.plantillaActual ?? 'no configurada'}`));

const profile = profiles[0];

// 2. Buscar empleados con recibos para este profile
const empleadosConRecibos = await db
  .select({
    empleadoId: liquidacionImportEmpleado.id,
    nombre: liquidacionImportEmpleado.nombre,
    cantRecibos: liquidacionImportRecibo.id,
  })
  .from(liquidacionImportEmpleado)
  .innerJoin(
    liquidacionImportRecibo,
    eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
  )
  .where(eq(liquidacionImportEmpleado.clientId, profile.id))
  .orderBy(desc(liquidacionImportRecibo.periodo))
  .limit(10);

if (empleadosConRecibos.length === 0) {
  console.error('No se encontraron empleados con recibos para este profile.');
  process.exit(1);
}

// Tomar el primer empleado único con recibos
const primero = empleadosConRecibos[0];
console.log(`\nEmpleado de referencia seleccionado: ${primero.nombre} (${primero.empleadoId})`);

// 3. Setear payrollPlantillaEmpleadoId
await db
  .update(client)
  .set({ payrollPlantillaEmpleadoId: primero.empleadoId })
  .where(eq(client.id, profile.id));

console.log(`\n✓ Plantilla base configurada para "${profile.name}".`);
console.log(`  Empleado de referencia: ${primero.nombre}`);
console.log(`  A partir de ahora, "Nuevo recibo" pre-activa los conceptos del último recibo de ese empleado.`);
