/**
 * Debug: muestra el valor crudo de row[14] (fechaIngreso) para un CUIL dado
 */
import * as XLSX from "xlsx";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const LEGAJOS_DIR = "C:/Users/Brian/Downloads/SOS_empresas_legajos";
const CUIL_BUSCAR = "27295946356"; // empleada E-presis

const entries = readdirSync(LEGAJOS_DIR);
for (const entry of entries) {
  const dir = join(LEGAJOS_DIR, entry);
  if (!statSync(dir).isDirectory()) continue;

  const files = readdirSync(dir).filter(
    (f) => f.toLowerCase().endsWith(".xls") || f.toLowerCase().endsWith(".xlsx")
  );

  for (const file of files) {
    const path = join(dir, file);
    const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const cuil = String(row[2] ?? "").replace(/[-\s]/g, "");
      if (cuil !== CUIL_BUSCAR) continue;

      console.log(`\nEncontrado en: ${entry} / ${file} — fila ${i}`);
      console.log(`  row[0]  (CUIT empresa): ${JSON.stringify(row[0])}`);
      console.log(`  row[2]  (CUIL):         ${JSON.stringify(row[2])}`);
      console.log(`  row[3]  (Nombre):       ${JSON.stringify(row[3])}`);
      console.log(`  row[14] (FechaIngreso): ${JSON.stringify(row[14])}  tipo: ${typeof row[14]}`);

      // Leer también con cellDates: true para ver la fecha interpretada por xlsx
      const wb2 = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
      const sheet2 = wb2.Sheets[wb2.SheetNames[0]];
      const rows2 = XLSX.utils.sheet_to_json<unknown[]>(sheet2, { header: 1, defval: null }) as unknown[][];
      const row2 = rows2[i];
      console.log(`  row[14] con cellDates:true: ${JSON.stringify(row2?.[14])}  tipo: ${typeof row2?.[14]}`);

      // Ver el texto literal de la celda
      const cellAddr = XLSX.utils.encode_cell({ r: i, c: 14 });
      const cell = sheet[cellAddr];
      console.log(`  Celda ${cellAddr} raw:`, JSON.stringify(cell));
    }
  }
}
console.log("\nFin.");
