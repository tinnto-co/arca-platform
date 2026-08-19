/**
 * Expande payroll_convenio_categoria para CCT 389/04 (Gastronomía):
 * un registro por puesto por tipo de establecimiento.
 *
 * - codigo: CAT4_1EST_D_Medio_oficial_panadero, CAT4_1EST_D_Mucama, etc.
 * - nombre: el puesto (Mucama, Telefonista, etc.)
 *
 * Estrategia:
 *   1. Actualiza el registro existente → primer puesto (preserva ID + escalas)
 *   2. Inserta registros nuevos para los puestos restantes, copiando las escalas
 *
 * Fuente: https://estudiovilaplana.com.ar/sueldos-gastronomicos/
 */
import { db } from "@/lib/db";
import { payrollConvenioCategoria, payrollConvenio, payrollEscala } from "@/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

// ─── Puestos por categoría ────────────────────────────────────────────────────
const PUESTOS: Record<number, string[]> = {
  1: ["Cadete", "Groom", "Peón general", "Lavacopas", "Portería"],
  2: ["Montaplatos", "Ascensorista", "Sereno", "Mensajero", "Mozo mostrador", "Jardinero", "Delivery", "Aux. administración"],
  3: ["Ayudante panadero", "Barman", "Planchadora", "Lencera", "Lavadero/a", "Mozo mostrador con atención al público", "Capataz de peones", "Cafetero"],
  4: ["Medio oficial panadero", "Mucama", "Valet", "Telefonista", "Chofer", "Oficial de oficios varios", "Garagista", "Minutero"],
  5: ["Comis de Cocina", "Oficial Panadero", "Adicionista", "Cajero", "Pastelero", "Guardavidas", "Comis", "Fiambrero", "Sandwichero", "Disc Jockey", "Sonido"],
  6: ["Jefe de Partida", "Cocinero", "Mozo de Salón y de Vinos", "Camareros", "Gobernanta", "Emp. Ppal. Adm", "Barman", "Postrero", "Recepcionista", "Chef de Fila", "Parrillero", "Rotisero", "Conserje Ppal", "Masajista", "Maestro Pastelero"],
  7: ["Jefe de brigada", "Gobernanta principal", "Conserje principal", "Maitre principal", "Jefe técnico especial de oficio", "Jefe de conserjería", "Jefe de recepción"],
};

/** Normaliza un nombre de puesto para usarlo en el código: "Medio oficial panadero" → "Medio_oficial_panadero" */
function puestoToCodigo(puesto: string): string {
  return puesto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^a-zA-Z0-9\s]/g, "") // quita caracteres especiales
    .trim()
    .replace(/\s+/g, "_");
}

/** Extrae el número de categoría del código actual: "CAT4_1EST_D" → 4 */
function getCatNum(codigo: string): number | null {
  const m = /^CAT(\d+)_/.exec(codigo);
  return m ? parseInt(m[1]) : null;
}

/**
 * Obtiene el prefijo base del código (sin puesto): "CAT4_1EST_D"
 * Funciona tanto con el formato viejo con puesto como con el actual sin él.
 */
function getCodigoBase(codigo: string): string {
  // Si ya tiene el formato nuevo (sin puesto), lo devuelve tal cual
  // Formato: CAT{N}_{M}EST o CAT{N}_{M}EST_{Letra}
  const m = /^(CAT\d+_\d+EST(?:_[A-D])?)(?:_.*)?$/.exec(codigo);
  return m ? m[1] : codigo;
}

// ─── Buscar convenios CCT 389/04 ──────────────────────────────────────────────
const gastroConvenios = (await db.select().from(payrollConvenio))
  .filter(c => c.cctCodigo === "389/04");

if (gastroConvenios.length === 0) {
  console.error("No se encontraron convenios CCT 389/04"); process.exit(1);
}
console.log(`Convenios CCT 389/04: ${gastroConvenios.length}`);

const convenioIds = gastroConvenios.map(c => c.id);
const categorias = await db.select().from(payrollConvenioCategoria)
  .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));

console.log(`Registros actuales: ${categorias.length}`);

// ─── Procesar cada registro ───────────────────────────────────────────────────
let actualizados = 0;
let insertados = 0;
let errores: string[] = [];

for (const cat of categorias) {
  const codigoBase = getCodigoBase(cat.codigo);
  const catNum = getCatNum(codigoBase);

  if (catNum === null) {
    errores.push(`Codigo no reconocido: ${cat.codigo}`); continue;
  }

  const puestos = PUESTOS[catNum];
  if (!puestos?.length) {
    errores.push(`Sin puestos definidos para CAT${catNum}: ${cat.codigo}`); continue;
  }

  // Obtener escalas de este registro (para copiarlas a los nuevos)
  const escalas = await db.select().from(payrollEscala)
    .where(eq(payrollEscala.categoriaId, cat.id));

  // 1. Actualizar el registro existente → primer puesto
  const primerPuesto = puestos[0];
  const nuevoCodigo = `${codigoBase}_${puestoToCodigo(primerPuesto)}`;

  await db.update(payrollConvenioCategoria)
    .set({ codigo: nuevoCodigo, nombre: primerPuesto })
    .where(eq(payrollConvenioCategoria.id, cat.id));
  actualizados++;

  // 2. Insertar registros para los puestos restantes
  for (const puesto of puestos.slice(1)) {
    const codPuesto = `${codigoBase}_${puestoToCodigo(puesto)}`;

    const [nuevaCat] = await db.insert(payrollConvenioCategoria).values({
      convenioId: cat.convenioId,
      codigo: codPuesto,
      nombre: puesto,
      orden: cat.orden,
    }).returning({ id: payrollConvenioCategoria.id });

    // Copiar escalas al nuevo registro
    if (escalas.length > 0 && nuevaCat) {
      await db.insert(payrollEscala).values(
        escalas.map(e => ({
          categoriaId: nuevaCat.id,
          vigenciaDesde: e.vigenciaDesde,
          vigenciaHasta: e.vigenciaHasta ?? undefined,
          montoBasico: e.montoBasico,
          montoNoRemunerativo: e.montoNoRemunerativo,
          periodoLabel: e.periodoLabel ?? undefined,
          fuente: e.fuente ?? undefined,
        }))
      );
    }

    insertados++;
  }
}

// ─── Reporte ──────────────────────────────────────────────────────────────────
const total = await db.select().from(payrollConvenioCategoria)
  .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));
const totalEscalas = await db.select().from(payrollEscala)
  .where(inArray(payrollEscala.categoriaId, total.map(c => c.id)));

console.log("\n" + "=".repeat(70));
console.log("  RESULTADO");
console.log("=".repeat(70));
console.log(`  Registros actualizados (primer puesto) : ${actualizados}`);
console.log(`  Registros insertados (puestos restantes): ${insertados}`);
console.log(`  Total categorías ahora                 : ${total.length}`);
console.log(`  Total escalas ahora                    : ${totalEscalas.length}`);
if (errores.length > 0) {
  console.log(`\n  ERRORES (${errores.length}):`);
  for (const e of errores) console.log(`    - ${e}`);
}

// Muestra de un convenio, CAT4
console.log("\n  Muestra CAT4 (primer convenio):");
const muestra = total
  .filter(c => c.convenioId === gastroConvenios[0].id && c.codigo.startsWith("CAT4"))
  .sort((a, b) => a.codigo.localeCompare(b.codigo));
for (const r of muestra) {
  console.log(`  [${r.codigo}] → "${r.nombre}"`);
}

process.exit(0);
