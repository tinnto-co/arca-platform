/**
 * Debug: lee el Excel de Admip y muestra claves + CUIL crudos (sin DB).
 * Uso: bun run src/scripts/debug-admip-legajos-excel.ts
 */
import * as XLSX from 'xlsx';

const filePath =
  'C:\\Users\\Brian\\Downloads\\SOS_empresas_legajos\\SOS_empresas_legajos\\Admip SRL\\30-70792005-6_legajos.xls';

function main() {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: true });
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name ?? ''];
  if (!sheet) {
    console.log('Sin hoja');
    return;
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: null,
  });
  console.log('Hoja:', name, 'filas JSON:', rows.length);
  if (rows[0]) {
    console.log('Claves primera fila:', Object.keys(rows[0]));
    console.log('Primera fila raw:', rows[0]);
  }
  if (rows[1]) console.log('Segunda fila raw:', rows[1]);

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
  console.log('Primeras 3 filas como array (header=1):');
  console.log(JSON.stringify(aoa.slice(0, 3), null, 2));
}

main();
