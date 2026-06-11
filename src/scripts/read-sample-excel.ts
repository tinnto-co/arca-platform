import * as XLSX from "xlsx";
import { readFileSync } from "fs";

// Check a few different companies to see if format is consistent
const files = [
  "C:/Users/Brian/Downloads/SOS_empresas_legajos/Gastrotecno S.A./30-71807478-5_legajos.xls",
  "C:/Users/Brian/Downloads/SOS_empresas_legajos/Hexacom SA/30-64320281-2_legajos.xls",
  "C:/Users/Brian/Downloads/SOS_empresas_legajos/Smart Solution SRL/30-71487150-8_legajos.xls",
];

for (const filePath of files) {
  console.log("\n=== FILE:", filePath.split("/").pop(), "===");
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  for (let i = 0; i < Math.min(5, data.length); i++) {
    if ((data[i] as unknown[]).length > 0) {
      console.log(`  Row ${i}:`, JSON.stringify(data[i]));
    }
  }
}
process.exit(0);
