import { db } from "@/lib/db";
import { liquidacionImportEmpleado, liquidacionImportRecibo, liquidacionImportConceptoValor } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

const emp = await db.select().from(liquidacionImportEmpleado)
  .where(eq(liquidacionImportEmpleado.cuil, "23960132769"))
  .limit(1);
if (!emp[0]) { console.log("No encontrado"); process.exit(1); }
console.log("Empleado:", emp[0].nombre, "id:", emp[0].id);

const recibos = await db.select().from(liquidacionImportRecibo)
  .where(eq(liquidacionImportRecibo.empleadoId, emp[0].id))
  .orderBy(liquidacionImportRecibo.periodo);
console.log("Recibos:", recibos.map(r => r.periodo).join(", "));

const ultimo = recibos.at(-1);
if (!ultimo) { console.log("Sin recibos"); process.exit(1); }
console.log("Último período:", ultimo.periodo);

const conceptos = await db.select().from(liquidacionImportConceptoValor)
  .where(eq(liquidacionImportConceptoValor.reciboId, ultimo.id))
  .orderBy(liquidacionImportConceptoValor.codigo);

console.log("\nConceptos (código | monto | cantidad | porcentaje | importe):");
for (const c of conceptos) {
  const cod = Number(c.codigo);
  if (cod < 1 || cod > 699) continue; // solo SOS
  console.log(`  ${String(c.codigo).padStart(3)} | monto=${c.monto ?? '-'} | cant=${c.cantidad ?? '-'} | pct=${c.porcentaje ?? '-'} | imp=${c.importe ?? '-'}`);
}
console.log("\nTotal conceptos:", conceptos.length);
