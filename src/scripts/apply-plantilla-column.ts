/**
 * Aplica manualmente la columna payroll_plantilla_empleado_id a la tabla client
 * y setea el empleado de referencia para E-Presis (CUIL 23960132769).
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { liquidacionImportEmpleado } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

// 1. Agregar columna si no existe
await db.execute(sql`
  ALTER TABLE client
  ADD COLUMN IF NOT EXISTS payroll_plantilla_empleado_id UUID
  REFERENCES liquidacion_import_empleado(id) ON DELETE SET NULL
`);
console.log("✓ Columna payroll_plantilla_empleado_id creada (o ya existía)");

// 2. Buscar el empleado de referencia por CUIL
const [emp] = await db
  .select({ id: liquidacionImportEmpleado.id, nombre: liquidacionImportEmpleado.nombre, clientId: liquidacionImportEmpleado.clientId })
  .from(liquidacionImportEmpleado)
  .where(eq(liquidacionImportEmpleado.cuil, "23960132769"))
  .limit(1);

if (!emp) {
  console.error("✗ No se encontró el empleado con CUIL 23960132769");
  process.exit(1);
}
console.log(`✓ Empleado de referencia: ${emp.nombre} (id: ${emp.id}, clientId: ${emp.clientId})`);

// 3. Setear la referencia en el profile (client) correspondiente
await db.execute(sql`
  UPDATE client SET payroll_plantilla_empleado_id = ${emp.id}
  WHERE id = ${emp.clientId}
`);
console.log(`✓ Referencia seteada en el cliente ${emp.clientId}`);
