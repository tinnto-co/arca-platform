import { db } from "@/lib/db";
import { payrollConvenioCategoria, payrollConvenio, payrollEscala, liquidacionImportEmpleado } from "@/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const gastroConvenios = (await db.select().from(payrollConvenio)).filter(c => c.cctCodigo === "389/04");
const convenioIds = gastroConvenios.map(c => c.id);
const cats = await db.select().from(payrollConvenioCategoria).where(inArray(payrollConvenioCategoria.convenioId, convenioIds));
const catIds = cats.map(c => c.id);

// Escalas vinculadas
const escalas = await db.select().from(payrollEscala).where(inArray(payrollEscala.categoriaId, catIds));
console.log("Escalas vinculadas a categorías gastronomico:", escalas.length);
if (escalas.length > 0) {
  console.log("Muestra:", JSON.stringify(escalas.slice(0,2), null, 2));
}

// Empleados con categoriaId que apunta a alguna cat gastronomico
const emps = await db.select({ id: liquidacionImportEmpleado.id, nombre: liquidacionImportEmpleado.nombre, categoriaId: liquidacionImportEmpleado.categoriaId })
  .from(liquidacionImportEmpleado)
  .where(inArray(liquidacionImportEmpleado.categoriaId, catIds));
console.log("\nEmpleados vinculados a categorías gastronomico:", emps.length);
if (emps.length > 0) {
  for (const e of emps.slice(0, 5)) {
    const cat = cats.find(c => c.id === e.categoriaId);
    console.log(`  ${e.nombre} → [${cat?.codigo}] ${cat?.nombre?.split(' / ')[0]}`);
  }
}
process.exit(0);
