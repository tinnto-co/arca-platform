/**
 * Script: fix-fecha-alta-empleados.ts
 *
 * Lee todos los XLS de SOS_empresas_legajos, extrae la fecha de ingreso (col 14)
 * de cada empleado y la compara con fecha_alta en la BD.
 * Si difieren, actualiza la BD con la fecha del Excel.
 *
 * Modo dry-run por defecto — pasar --apply para ejecutar los updates.
 *
 * Uso:
 *   bun run src/scripts/fix-fecha-alta-empleados.ts            # dry-run
 *   bun run src/scripts/fix-fecha-alta-empleados.ts --apply    # aplica cambios
 */

import * as XLSX from "xlsx";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { liquidacionImportEmpleado } from "@/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const LEGAJOS_DIR =
  "C:/Users/Brian/Downloads/SOS_empresas_legajos";

const DRY_RUN = !process.argv.includes("--apply");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCuil(val: unknown): string {
  return String(val ?? "").replace(/[-\s]/g, "").trim();
}

/**
 * Convierte un valor de celda Excel a Date UTC (sin componente de hora).
 * Usa cellDates:true en XLSX para que la librería resuelva la fecha correctamente,
 * luego toma los getters locales (getFullYear/getMonth/getDate) para el día literal.
 */
function parseExcelDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === 0 || val === "" || val === false || val === "false")
    return null;
  // Con cellDates:true, XLSX lee el serial en formato US (m/d/yy).
  // SOS Contador exporta con formato US aunque el usuario cargó DD/MM/AAAA.
  // Ej: serial → "2023-01-05" (US: mes=1, día=5) pero el dato real es 01/05/2023 = 1 de mayo.
  // Solución: intercambiar mes y día (DD/MM → MM/DD).
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const [y, usM, usD] = val.toISOString().slice(0, 10).split('-').map(Number);
    // usM = lo que Excel llama "mes" = en realidad el DÍA argentino
    // usD = lo que Excel llama "día" = en realidad el MES argentino
    const argDay = usM;
    const argMonth = usD;
    if (argMonth >= 1 && argMonth <= 12) {
      return new Date(Date.UTC(y, argMonth - 1, argDay));
    }
    // Si el "día" US > 12, el mes resultante sería inválido; usar sin swap
    return new Date(Date.UTC(y, usM - 1, usD));
  }
  // Fallback: serial numérico sin cellDates (usar parte entera = día, ignorar fracción)
  if (typeof val === "number" && val > 1) {
    const serial = Math.floor(val);
    return new Date((serial - 25569) * 86400 * 1000);
  }
  // String "DD/MM/YYYY"
  if (typeof val === "string" && val.trim()) {
    const parts = val.trim().split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (d && m && y) return new Date(Date.UTC(y, m - 1, d));
    }
  }
  return null;
}

/** Normaliza una Date a "YYYY-MM-DD" para comparación */
function toDateStr(d: Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

// ─── Leer todos los XLS ───────────────────────────────────────────────────────

interface ExcelRecord {
  cuil: string;
  cuitEmpresa: string;
  empresa: string;
  fechaIngreso: Date | null;
}

function readLegajosDir(): ExcelRecord[] {
  const records: ExcelRecord[] = [];

  const entries = readdirSync(LEGAJOS_DIR);
  for (const entry of entries) {
    const dir = join(LEGAJOS_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;

    const files = readdirSync(dir).filter((f) =>
      f.toLowerCase().endsWith(".xls") || f.toLowerCase().endsWith(".xlsx")
    );

    for (const file of files) {
      const path = join(dir, file);
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
      } catch (e) {
        console.warn(`  [WARN] No se pudo leer ${path}: ${e}`);
        continue;
      }

      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
      }) as unknown[][];

      // Detectar fila de encabezado (primera que tenga "CUIL" o similar)
      let dataStart = 1;
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const r = rows[i];
        if (r && r.some((c) => String(c ?? "").toUpperCase().includes("CUIL"))) {
          dataStart = i + 1;
          break;
        }
      }

      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0] || !row[2]) continue;
        const cuil = normalizeCuil(row[2]);
        if (cuil.length !== 11) continue;

        records.push({
          cuil,
          cuitEmpresa: normalizeCuil(row[0]),
          empresa: entry,
          fechaIngreso: parseExcelDate(row[14]),
        });
      }
    }
  }

  return records;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n=== fix-fecha-alta-empleados ${DRY_RUN ? "(DRY-RUN)" : "(APPLY)"} ===\n`
  );

  // 1. Leer todos los registros del Excel
  console.log("Leyendo archivos XLS...");
  const excelRecords = readLegajosDir();
  console.log(`  ${excelRecords.length} registros leídos de ${LEGAJOS_DIR}\n`);

  // Construir mapa cuil → fechaIngreso (si hay duplicados, el último gana)
  const excelMap = new Map<string, { fechaIngreso: Date | null; empresa: string }>();
  for (const rec of excelRecords) {
    excelMap.set(rec.cuil, { fechaIngreso: rec.fechaIngreso, empresa: rec.empresa });
  }

  // 2. Traer todos los empleados de la BD
  console.log("Cargando empleados desde la BD...");
  const empleados = await db
    .select({
      id: liquidacionImportEmpleado.id,
      cuil: liquidacionImportEmpleado.cuil,
      nombre: liquidacionImportEmpleado.nombre,
      fechaAlta: liquidacionImportEmpleado.fechaAlta,
    })
    .from(liquidacionImportEmpleado);

  console.log(`  ${empleados.length} empleados en BD\n`);

  // 3. Comparar y acumular updates
  type Update = {
    id: string;
    cuil: string;
    nombre: string;
    empresa: string;
    dbFecha: string | null;
    xlsFecha: string | null;
  };

  const toUpdate: Update[] = [];
  const sinFechaExcel: string[] = [];
  const sinEnExcel: string[] = [];
  const yaCorrectos: number[] = [];

  for (const emp of empleados) {
    const cuil = normalizeCuil(emp.cuil);
    const entry = excelMap.get(cuil);

    if (!entry) {
      sinEnExcel.push(`${emp.nombre} (${cuil})`);
      continue;
    }

    if (!entry.fechaIngreso) {
      sinFechaExcel.push(`${emp.nombre} (${cuil}) — empresa: ${entry.empresa}`);
      continue;
    }

    const dbStr = toDateStr(emp.fechaAlta);
    const xlsStr = toDateStr(entry.fechaIngreso);

    if (dbStr === xlsStr) {
      yaCorrectos.push(emp.id as unknown as number);
      continue;
    }

    toUpdate.push({
      id: emp.id as unknown as string,
      cuil,
      nombre: emp.nombre ?? "",
      empresa: entry.empresa,
      dbFecha: dbStr,
      xlsFecha: xlsStr,
    });
  }

  // 4. Mostrar resumen previo
  console.log(`Resultados del análisis:`);
  console.log(`  ✔  Ya correctos:          ${yaCorrectos.length}`);
  console.log(`  ↑  Para actualizar:        ${toUpdate.length}`);
  console.log(`  ✗  Sin fecha en Excel:     ${sinFechaExcel.length}`);
  console.log(`  ?  No encontrados en XLS:  ${sinEnExcel.length}\n`);

  if (toUpdate.length > 0) {
    console.log("Detalle de actualizaciones:");
    for (const u of toUpdate) {
      console.log(
        `  [${u.empresa}] ${u.nombre} (${u.cuil})\n` +
          `      BD:    ${u.dbFecha ?? "null"}\n` +
          `      Excel: ${u.xlsFecha ?? "null"}`
      );
    }
    console.log();
  }

  if (sinFechaExcel.length > 0) {
    console.log("Sin fecha de ingreso en Excel (se omiten):");
    for (const s of sinFechaExcel.slice(0, 20)) console.log(`  - ${s}`);
    if (sinFechaExcel.length > 20) console.log(`  ... y ${sinFechaExcel.length - 20} más`);
    console.log();
  }

  if (sinEnExcel.length > 0) {
    console.log("Empleados en BD no encontrados en ningún XLS:");
    for (const s of sinEnExcel.slice(0, 20)) console.log(`  - ${s}`);
    if (sinEnExcel.length > 20) console.log(`  ... y ${sinEnExcel.length - 20} más`);
    console.log();
  }

  // 5. Aplicar updates
  if (toUpdate.length === 0) {
    console.log("No hay cambios que aplicar.");
    return;
  }

  if (DRY_RUN) {
    console.log(
      `DRY-RUN: se habrían actualizado ${toUpdate.length} empleados.\n` +
        `Volvé a correr con --apply para aplicar los cambios.\n`
    );
    return;
  }

  console.log(`Aplicando ${toUpdate.length} actualizaciones...`);
  let ok = 0;
  let fail = 0;

  for (const u of toUpdate) {
    try {
      await db
        .update(liquidacionImportEmpleado)
        .set({ fechaAlta: new Date(u.xlsFecha!) })
        .where(eq(liquidacionImportEmpleado.id, u.id as unknown as any));
      ok++;
    } catch (e) {
      console.error(`  ERROR al actualizar ${u.nombre} (${u.cuil}): ${e}`);
      fail++;
    }
  }

  console.log(`\nFinalizado: ${ok} actualizados, ${fail} errores.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
