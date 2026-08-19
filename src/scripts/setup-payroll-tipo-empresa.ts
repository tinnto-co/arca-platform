/**
 * Setup script para payroll_tipo_empresa.
 *
 * 1. Crea la tabla payroll_tipo_empresa (si no existe).
 * 2. Agrega columnas payroll a la tabla client (si no existen).
 * 3. Semilla los 8 tipos de empresa de SOS Contador.
 * 4. Actualiza client con los datos scrapeados de "Datos del Empleador".
 *
 * Uso: bun run src/scripts/setup-payroll-tipo-empresa.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// ─── 1. Crear tabla payroll_tipo_empresa ────────────────────────────────────

await sql`
  CREATE TABLE IF NOT EXISTS payroll_tipo_empresa (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_sos TEXT UNIQUE,
    nombre     TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )
`;
console.log("✓ Tabla payroll_tipo_empresa lista");

// ─── 2. Agregar columnas a client ────────────────────────────────────────────

await sql`ALTER TABLE client ADD COLUMN IF NOT EXISTS tipo_empresa_id UUID REFERENCES payroll_tipo_empresa(id) ON DELETE SET NULL`;
await sql`ALTER TABLE client ADD COLUMN IF NOT EXISTS seguro_colectivo BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE client ADD COLUMN IF NOT EXISTS mipyme BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE client ADD COLUMN IF NOT EXISTS orden_cln TEXT`;
console.log("✓ Columnas de client agregadas");

// ─── 3. Seed de los 8 tipos de empresa ──────────────────────────────────────

const tiposEmpresa = [
  { codigoSos: "3180", nombre: "Administración Pública" },
  { codigoSos: "3181", nombre: "Dec 814/01, art. 2, inc. B" },
  { codigoSos: "3182", nombre: "Servicios Eventuales art. 2, inc. B" },
  { codigoSos: "3183", nombre: "Provincias u Otros" },
  { codigoSos: "3184", nombre: "Dec 814/01, art. 2, inc. A" },
  { codigoSos: "3185", nombre: "Servicios Eventuales art. 2, inc. A" },
  { codigoSos: "3187", nombre: "Enseñanza Privada" },
  { codigoSos: "3188", nombre: "Decreto N° 1212/03 AFA CLUBES" },
];

for (const te of tiposEmpresa) {
  await sql`
    INSERT INTO payroll_tipo_empresa (codigo_sos, nombre)
    VALUES (${te.codigoSos}, ${te.nombre})
    ON CONFLICT (codigo_sos) DO UPDATE SET nombre = EXCLUDED.nombre
  `;
}
console.log("✓ Tipos de empresa seeded (8 opciones)");

// ─── 4. Mapear datos scrapeados a client ─────────────────────────────────────
// Datos de SOS Contador "Datos del Empleador" para cada empresa.
// te = código SOS de tipo empresa | s = seguro colectivo | o = orden CLN

const empleadorData: { cuit: string; te?: string; s: number; o?: string }[] = [
  { cuit: "30707920056", te: "3181", s: 1, o: "C" },
  { cuit: "30719153255", te: "3181", s: 0, o: "C" },
  { cuit: "30718726340", te: "3184", s: 0, o: "C" },
  { cuit: "20259968012", te: "3184", s: 0, o: "C" },
  { cuit: "30719305535", te: "3181", s: 1, o: "C" },
  { cuit: "30715944029", te: "3181", s: 0, o: "L" },
  { cuit: "20180955454", te: "3181", s: 1, o: "C" },
  { cuit: "33717904309", te: "3181", s: 0, o: "L" },
  { cuit: "20349758610", te: "3181", s: 0, o: "C" },
  { cuit: "30718161394", te: "3181", s: 0, o: "C" },
  { cuit: "20235093287", te: "3184", s: 0, o: "C" },
  { cuit: "30717554864", te: "3181", s: 0, o: "L" },
  { cuit: "20219816090" /* sin tipo_empresa configurado */, s: 0 },
  { cuit: "33719196239", te: "3184", s: 0, o: "C" },
  { cuit: "30718074785", te: "3181", s: 0, o: "L" },
  { cuit: "30716206404", te: "3181", s: 0, o: "L" },
  { cuit: "30716135124", te: "3181", s: 0, o: "L" },
  { cuit: "27388941974", te: "3181", s: 0, o: "C" },
  { cuit: "30718394682", te: "3181", s: 1, o: "L" },
  { cuit: "33718970089", te: "3184", s: 0, o: "C" },
  { cuit: "20249628116", te: "3184", s: 0, o: "C" },
  { cuit: "30643202812", te: "3184", s: 0, o: "C" },
  { cuit: "23251342199", te: "3184", s: 0, o: "C" },
  { cuit: "30717679845", te: "3181", s: 0, o: "L" },
  { cuit: "30719184835", te: "3181", s: 0, o: "C" },
  { cuit: "30717680568", te: "3181", s: 0, o: "L" },
  { cuit: "30718524551", te: "3181", s: 0, o: "L" },
  { cuit: "30717605663", te: "3184", s: 0, o: "C" },
  { cuit: "27175689937", te: "3184", s: 0, o: "C" },
  { cuit: "30718958934", te: "3184", s: 0, o: "C" },
  { cuit: "30718323386", te: "3181", s: 0, o: "L" },
  { cuit: "30717548767", te: "3181", s: 0, o: "L" },
  { cuit: "30718374142", te: "3184", s: 0, o: "C" },
  { cuit: "30714871087", te: "3181", s: 0, o: "C" },
  { cuit: "33718009419", te: "3181", s: 0, o: "L" },
  { cuit: "30717679136", te: "3181", s: 1, o: "L" },
  { cuit: "30717786986", te: "3181", s: 0, o: "C" },
  { cuit: "30719105056", te: "3181", s: 0, o: "L" },
  { cuit: "30719167094", te: "3181", s: 0, o: "C" },
  { cuit: "30718922565", te: "3181", s: 0, o: "C" },
  { cuit: "30716753251", te: "3181", s: 1, o: "L" },
  { cuit: "30714955930", te: "3181", s: 0, o: "C" },
  { cuit: "30718310519", te: "3181", s: 0, o: "L" },
  { cuit: "20127571083", te: "3181", s: 1, o: "L" },
  { cuit: "20231269879", te: "3181", s: 0, o: "C" },
  { cuit: "30715433490", te: "3181", s: 1, o: "C" },
  { cuit: "30718149874", te: "3182", s: 0, o: "C" },
  { cuit: "30714871508", te: "3181", s: 1, o: "C" },
  { cuit: "20308861210", te: "3184", s: 0, o: "C" },
  { cuit: "30716025752", te: "3181", s: 1, o: "L" },
  { cuit: "30716787407", te: "3181", s: 0, o: "L" },
  { cuit: "33718399799", te: "3181", s: 0, o: "C" },
  { cuit: "30718084209", te: "3184", s: 0, o: "C" },
];

// Obtener el mapa de codigo_sos → id de payroll_tipo_empresa
const tiposRows = await sql<{ id: string; codigo_sos: string }[]>`
  SELECT id, codigo_sos FROM payroll_tipo_empresa
`;
const tipoMap = new Map(tiposRows.map((r) => [r.codigo_sos, r.id]));

let updated = 0;
let notFound = 0;

for (const emp of empleadorData) {
  const tipoEmpresaId = emp.te ? tipoMap.get(emp.te) ?? null : null;
  const seguro = emp.s === 1;
  const orden = emp.o ?? null;

  const result = await sql`
    UPDATE client
    SET
      tipo_empresa_id   = ${tipoEmpresaId},
      seguro_colectivo  = ${seguro},
      orden_cln         = ${orden}
    WHERE identity_number = ${emp.cuit}
    RETURNING id, name
  `;

  if (result.length > 0) {
    console.log(`  ✓ ${result[0].name} (${emp.cuit}) → te=${emp.te ?? "N/A"}, seg=${seguro}, ord=${orden}`);
    updated++;
  } else {
    console.log(`  ⚠ CUIT ${emp.cuit} no encontrado en client`);
    notFound++;
  }
}

console.log(`\n✓ Actualización completa: ${updated} clientes actualizados, ${notFound} no encontrados`);

await sql.end();
