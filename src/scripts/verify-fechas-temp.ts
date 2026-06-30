import { db } from '@/lib/db';
import { liquidacionImportEmpleado, client } from '@/drizzle/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

// Check Garay in Artzeinu (cuit 30719153255, cuil 20216158408)
// and a few other cases where ant != leg
const cases = [
  { cuit: '30719153255', cuil: '20216158408' }, // Garay en Artzeinu
  { cuit: '30719153255', cuil: '20228722287' }, // Espindola en Artzeinu
  { cuit: '30718394682', cuil: '27258491535' }, // Ramirez en Green Safety
];

const clients = await db.select({ id: client.id, cuit: client.identityNumber }).from(client);
const cuitMap = new Map(clients.map(c => [c.cuit, c.id]));

for (const { cuit, cuil } of cases) {
  const clientId = cuitMap.get(cuit);
  if (!clientId) { console.log(`Client not found: ${cuit}`); continue; }
  
  const [emp] = await db
    .select({ nombre: liquidacionImportEmpleado.nombre, fechaAlta: liquidacionImportEmpleado.fechaAlta, fechaIngreso: liquidacionImportEmpleado.fechaIngreso })
    .from(liquidacionImportEmpleado)
    .where(and(eq(liquidacionImportEmpleado.clientId, clientId), eq(liquidacionImportEmpleado.cuil, cuil)));
  
  console.log(`${cuit} / ${cuil}: fechaAlta=${emp?.fechaAlta?.toISOString()?.slice(0,10)} | fechaIngreso=${emp?.fechaIngreso?.toISOString()?.slice(0,10)} | nombre=${emp?.nombre}`);
}
