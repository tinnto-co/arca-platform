/**
 * Seed payroll_zona with AFIP LSD localidad codes.
 * Codes are 2-character: numeric (01-99) and alphanumeric (A0-E3).
 * Source: DjEmpleadoCarga.aspx ddlLocalidad dropdown.
 *
 * Uso: bun run src/scripts/seed-payroll-zona.ts
 */
import postgres from "postgres";

const ZONAS = [
  { codigo: "01", nombre: "Capital Federal" },
  { codigo: "02", nombre: "Buenos Aires - Gran Buenos Aires (zona interior)" },
  { codigo: "03", nombre: "Buenos Aires - Gran Buenos Aires (zona exterior)" },
  { codigo: "04", nombre: "Buenos Aires - Carmen de Patagones" },
  { codigo: "05", nombre: "Buenos Aires - Patagones" },
  { codigo: "06", nombre: "Buenos Aires - Villarino" },
  { codigo: "07", nombre: "Buenos Aires - Resto de la Provincia" },
  { codigo: "08", nombre: "Catamarca - Gran Catamarca" },
  { codigo: "09", nombre: "Catamarca" },
  { codigo: "10", nombre: "Córdoba - Sobremonte" },
  { codigo: "11", nombre: "Córdoba - Río Seco" },
  { codigo: "12", nombre: "Córdoba - Tulumba" },
  { codigo: "13", nombre: "Córdoba - Cruz del Eje" },
  { codigo: "14", nombre: "Córdoba - Minas" },
  { codigo: "15", nombre: "Córdoba - Pocho" },
  { codigo: "16", nombre: "Córdoba - San Alberto" },
  { codigo: "17", nombre: "Córdoba - San Javier" },
  { codigo: "18", nombre: "Córdoba - Gran Córdoba" },
  { codigo: "19", nombre: "Córdoba - Resto de la Provincia" },
  { codigo: "20", nombre: "Corrientes - Esquina" },
  { codigo: "21", nombre: "Corrientes - Sauce" },
  { codigo: "22", nombre: "Corrientes - Curuzú-Cuatia" },
  { codigo: "23", nombre: "Corrientes - Monte Caseros" },
  { codigo: "24", nombre: "Corrientes - Ciudad de Corrientes" },
  { codigo: "25", nombre: "Corrientes - Resto de la Provincia" },
  { codigo: "26", nombre: "Chaco - Gran Resistencia" },
  { codigo: "27", nombre: "Chaco" },
  { codigo: "28", nombre: "Chubut - Rawson" },
  { codigo: "29", nombre: "Chubut" },
  { codigo: "30", nombre: "Entre Ríos - Federación" },
  { codigo: "31", nombre: "Entre Ríos - Feliciano" },
  { codigo: "32", nombre: "Entre Ríos - Paraná" },
  { codigo: "33", nombre: "Entre Ríos - Resto de la Provincia" },
  { codigo: "34", nombre: "Formosa - Ciudad de Formosa" },
  { codigo: "35", nombre: "Formosa - Resto de la Provincia" },
  { codigo: "36", nombre: "Jujuy - Ciudad de Jujuy" },
  { codigo: "37", nombre: "Jujuy" },
  { codigo: "38", nombre: "La Pampa - Chical-Co" },
  { codigo: "39", nombre: "La Pampa - Chalileo" },
  { codigo: "40", nombre: "La Pampa - Puelén" },
  { codigo: "41", nombre: "La Pampa - Limay-Mahuilda" },
  { codigo: "42", nombre: "La Pampa - Curaco" },
  { codigo: "43", nombre: "La Pampa - Lihuel-Calel" },
  { codigo: "44", nombre: "La Pampa - Santa Rosa" },
  { codigo: "45", nombre: "La Pampa - Resto de la Provincia" },
  { codigo: "46", nombre: "La Rioja - Ciudad de La Rioja" },
  { codigo: "47", nombre: "La Rioja" },
  { codigo: "48", nombre: "Mendoza - Gran Mendoza" },
  { codigo: "49", nombre: "Mendoza" },
  { codigo: "50", nombre: "Misiones - Posadas" },
  { codigo: "51", nombre: "Misiones" },
  { codigo: "52", nombre: "Neuquén - Ciudad de Neuquén" },
  { codigo: "53", nombre: "Neuquén - Centenario" },
  { codigo: "54", nombre: "Neuquén - Cutral-Co" },
  { codigo: "55", nombre: "Neuquén - Plaza Huincul" },
  { codigo: "56", nombre: "Neuquén" },
  { codigo: "57", nombre: "Río Negro - Zona Nº 2" },
  { codigo: "58", nombre: "Río Negro - Viedma" },
  { codigo: "59", nombre: "Río Negro - Alejandro Stefenelli" },
  { codigo: "60", nombre: "Río Negro - Zona Nº 1" },
  { codigo: "61", nombre: "Salta - Gran Salta" },
  { codigo: "62", nombre: "Salta" },
  { codigo: "63", nombre: "San Juan - Gran San Juan" },
  { codigo: "64", nombre: "San Juan" },
  { codigo: "65", nombre: "San Luis - Ciudad de San Luis" },
  { codigo: "66", nombre: "San Luis" },
  { codigo: "67", nombre: "Santa Cruz - Caleta Olivia" },
  { codigo: "68", nombre: "Santa Cruz - Río Gallegos" },
  { codigo: "69", nombre: "Santa Cruz" },
  { codigo: "70", nombre: "Santa Fe - Gral. Obligado" },
  { codigo: "71", nombre: "Santa Fe - San Javier" },
  { codigo: "72", nombre: "Santa Fe - Santo Tomé" },
  { codigo: "73", nombre: "Santa Fe - 9 de Julio" },
  { codigo: "74", nombre: "Santa Fe - Vera" },
  { codigo: "75", nombre: "Santa Fe - Resto de la Provincia" },
  { codigo: "76", nombre: "Santiago del Estero - Ciudad de Santiago del Estero" },
  { codigo: "77", nombre: "Santiago del Estero - Ojo de Agua" },
  { codigo: "78", nombre: "Santiago del Estero - Quebrachos" },
  { codigo: "79", nombre: "Santiago del Estero - Rivadavia" },
  { codigo: "80", nombre: "Santiago del Estero - Resto de la Provincia" },
  { codigo: "81", nombre: "Tierra del Fuego - Río Grande" },
  { codigo: "82", nombre: "Tierra del Fuego - Ushuaia" },
  { codigo: "83", nombre: "Tierra del Fuego" },
  { codigo: "84", nombre: "Tucumán - Gran Tucumán" },
  { codigo: "85", nombre: "Tucumán" },
  { codigo: "87", nombre: "Formosa - Bermejo" },
  { codigo: "88", nombre: "Formosa - Ramón Lista" },
  { codigo: "89", nombre: "Formosa - Mataco" },
  { codigo: "90", nombre: "Mendoza - Las Heras - Las Cuevas" },
  { codigo: "91", nombre: "Mendoza - Resto Distritos Las Heras" },
  { codigo: "92", nombre: "Mendoza - Luján de Cuyo - Potrerillos" },
  { codigo: "93", nombre: "Mendoza - Luján de Cuyo - Carrizal" },
  { codigo: "94", nombre: "Mendoza - Luján de Cuyo - Agrelo" },
  { codigo: "95", nombre: "Mendoza - Luján de Cuyo - Ugarteche" },
  { codigo: "96", nombre: "Mendoza - Luján de Cuyo - Perdriel" },
  { codigo: "97", nombre: "Mendoza - Luján de Cuyo - Las Compuertas" },
  { codigo: "98", nombre: "Mendoza - Resto Distritos Luján de Cuyo" },
  { codigo: "99", nombre: "Mendoza - San Martín" },
  { codigo: "A0", nombre: "Mendoza - Distritos San Martín" },
  { codigo: "A1", nombre: "Mendoza - Junín" },
  { codigo: "A2", nombre: "Mendoza - Tupungato - Anchoris" },
  { codigo: "A3", nombre: "Mendoza - Resto Distritos Tupungato" },
  { codigo: "A4", nombre: "Mendoza - Tunuyán - Los Árboles" },
  { codigo: "A5", nombre: "Mendoza - Tunuyán - Los Chacayes" },
  { codigo: "A6", nombre: "Mendoza - Tunuyán - Campos de los Andes" },
  { codigo: "A7", nombre: "Mendoza - Resto Distritos Tunuyán" },
  { codigo: "A8", nombre: "Mendoza - San Carlos - Pareditas" },
  { codigo: "A9", nombre: "Mendoza - Resto Distritos San Carlos" },
  { codigo: "B0", nombre: "Mendoza - San Rafael - Cuadro Venegas" },
  { codigo: "B1", nombre: "Mendoza - Resto Distritos San Rafael" },
  { codigo: "B2", nombre: "Mendoza - Malargüe - Malargüe" },
  { codigo: "B3", nombre: "Mendoza - Malargüe - Río Grande" },
  { codigo: "B4", nombre: "Mendoza - Malargüe - Río Barrancas" },
  { codigo: "B5", nombre: "Mendoza - Malargüe - Agua Escondida" },
  { codigo: "B6", nombre: "Mendoza - Resto Distritos Malargüe" },
  { codigo: "B7", nombre: "Mendoza - Maipú - Russell" },
  { codigo: "B8", nombre: "Mendoza - Maipú - Cruz de Piedra" },
  { codigo: "B9", nombre: "Mendoza - Maipú - Lumlunta" },
  { codigo: "C0", nombre: "Mendoza - Maipú - Las Barrancas" },
  { codigo: "C1", nombre: "Mendoza - Resto Distritos Maipú" },
  { codigo: "C2", nombre: "Mendoza - Rivadavia - El Mirador" },
  { codigo: "C3", nombre: "Mendoza - Rivadavia - Los Campamentos" },
  { codigo: "C4", nombre: "Mendoza - Rivadavia - Los Árboles" },
  { codigo: "C5", nombre: "Mendoza - Rivadavia - Reducción" },
  { codigo: "C6", nombre: "Mendoza - Rivadavia - La Central" },
  { codigo: "C7", nombre: "Mendoza - Resto Distritos Rivadavia" },
  { codigo: "C8", nombre: "Salta - Orán - San Ramón de la Nueva Orán y su ejido urbano" },
  { codigo: "C9", nombre: "Salta - Resto Distritos Orán" },
  { codigo: "D0", nombre: "Salta - Los Andes" },
  { codigo: "D1", nombre: "Salta - Santa Victoria" },
  { codigo: "D2", nombre: "Salta - Rivadavia" },
  { codigo: "D3", nombre: "Salta - Gral. San Martín - Tartagal y su ejido urbano" },
  { codigo: "D4", nombre: "Salta - Resto Distritos Gral. San Martín" },
  { codigo: "D5", nombre: "Catamarca - Antofagasta de la Sierra - Actividad Minera" },
  { codigo: "D6", nombre: "Catamarca - Antofagasta de la Sierra - Resto Actividades" },
  { codigo: "D7", nombre: "Jujuy - Cochinoca" },
  { codigo: "D8", nombre: "Jujuy - Humahuaca" },
  { codigo: "D9", nombre: "Jujuy - Rinconada" },
  { codigo: "E0", nombre: "Jujuy - Santa Catalina" },
  { codigo: "E1", nombre: "Jujuy - Susques" },
  { codigo: "E2", nombre: "Jujuy - Yavi" },
  { codigo: "E3", nombre: "Pascua Lama" },
];

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = postgres(url, { prepare: false });

  console.log(`Seeding payroll_zona con ${ZONAS.length} registros...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const { codigo, nombre } of ZONAS) {
    const existing = await sql`SELECT id FROM payroll_zona WHERE codigo = ${codigo}`;
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await sql`INSERT INTO payroll_zona (id, codigo, nombre) VALUES (gen_random_uuid(), ${codigo}, ${nombre})`;
    inserted++;
  }

  const total = await sql`SELECT COUNT(*) as total FROM payroll_zona`;
  console.log(`  Insertados: ${inserted}`);
  console.log(`  Ya existían: ${skipped}`);
  console.log(`  Total en tabla: ${total[0].total}`);

  await sql.end();
  console.log("\nListo.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
