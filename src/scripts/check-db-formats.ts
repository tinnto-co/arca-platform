import { db } from "@/lib/db";
import { obraSocial, payrollModalidadContratacion, payrollSituacion, payrollZona, payrollCondicion, payrollActividad, payrollSiniestrado } from "@/drizzle/schema";

const mods = await db.select().from(payrollModalidadContratacion);
console.log("MODALIDADES:\n", mods.map(m => `${m.codigo} | ${m.nombre}`).join("\n"));

const sits = await db.select().from(payrollSituacion);
console.log("\nSITUACIONES:\n", sits.map(s => `${s.codigo} | ${s.nombre}`).join("\n"));

const zonas = await db.select().from(payrollZona);
console.log("\nZONAS:\n", zonas.map(z => `${z.codigo} | ${z.nombre}`).join("\n"));

const conds = await db.select().from(payrollCondicion);
console.log("\nCONDICIONES:\n", conds.map(c => `${c.codigo} | ${c.nombre}`).join("\n"));

const acts = await db.select().from(payrollActividad).limit(10);
console.log("\nACTIVIDADES (10):\n", acts.map(a => `${a.codigo} | ${a.nombre}`).join("\n"));

const sins = await db.select().from(payrollSiniestrado);
console.log("\nSINIESTRADOS:\n", sins.map(s => `${s.codigo} | ${s.nombre}`).join("\n"));

process.exit(0);
