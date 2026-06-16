import { db } from "@/lib/db";
import { liquidacionImportEmpleado } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

const rows = await db
  .select({
    id: liquidacionImportEmpleado.id,
    nombre: liquidacionImportEmpleado.nombre,
    cuil: liquidacionImportEmpleado.cuil,
    fechaAlta: liquidacionImportEmpleado.fechaAlta,
  })
  .from(liquidacionImportEmpleado)
  .limit(10);

console.log("Tipo de id:", typeof rows[0]?.id, "valor:", rows[0]?.id);
console.log("Tipo de fechaAlta:", typeof rows[0]?.fechaAlta, "valor:", rows[0]?.fechaAlta);
console.log("\nMuestra:");
for (const r of rows) {
  console.log(`  ${r.nombre} | cuil: ${r.cuil} | fechaAlta: ${r.fechaAlta}`);
}
