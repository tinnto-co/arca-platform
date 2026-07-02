import { db } from "@/lib/db";
import { payrollConvenioCategoria, payrollConvenio } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

// Buscar convenio gastronomico CCT 389/04
const convenios = await db.select().from(payrollConvenio);
const gastro = convenios.filter(c => c.cct?.includes("389") || c.nombre?.toLowerCase().includes("gastron"));
console.log("Convenios gastronomico:", JSON.stringify(gastro, null, 2));

if (gastro.length > 0) {
  for (const c of gastro) {
    const cats = await db.select().from(payrollConvenioCategoria).where(eq(payrollConvenioCategoria.convenioId, c.id));
    console.log(`\nCategorias de convenio ${c.cct} - ${c.nombre} (${cats.length} registros):`);
    for (const cat of cats.sort((a,b) => (a.codigo ?? "").localeCompare(b.codigo ?? ""))) {
      console.log(`  [${cat.codigo}] ${cat.nombre}`);
    }
  }
}
process.exit(0);
