/**
 * Actualiza datos de empleador en la tabla `client` con datos scrapeados de SOS Contador.
 * Fuente: Sueldos > Datos del Empleador (scraping de junio 2026, 70 empresas).
 *
 * Campos actualizados:
 *  - tipo_empresa_id   (FK a payroll_tipo_empresa via codigo_sos)
 *  - seguro_colectivo  (Decreto 1567/74)
 *  - mipyme            (certificado MiPyME)
 *  - orden_cln         (C=CUIL, L=Legajo, N=Nombre)
 *
 * Uso: bun run src/scripts/update-empleador-sos-2026.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// Dataset scrapeado de SOS Contador - junio 2026
// te = codigo_sos de payroll_tipo_empresa (null = sin sueldos configurado)
// seg = seguro colectivo (Decreto 1567/74)
// mipyme = certificado MiPyME vigente
// ord = orden predeterminado CLN
const empleadorData: Array<{
  cuit: string;
  te: string | null;
  seg: boolean;
  mipyme: boolean;
  ord: string | null;
}> = [
  { cuit: "30707920056", te: "3181", seg: true,  mipyme: false, ord: "C" }, // Admip SRL
  { cuit: "30719153255", te: "3181", seg: false, mipyme: false, ord: "C" }, // Artzeinu x2 S.A.
  { cuit: "30718726340", te: "3184", seg: false, mipyme: false, ord: "C" }, // Avz S.R.L.
  { cuit: "20259968012", te: "3184", seg: false, mipyme: false, ord: "C" }, // Berns Sebastian Matias
  { cuit: "30719305535", te: "3181", seg: true,  mipyme: false, ord: "C" }, // Besorot Tovot S.A.
  { cuit: "30715944029", te: "3181", seg: false, mipyme: false, ord: "L" }, // Brique Construcciones
  { cuit: "20180955454", te: "3181", seg: true,  mipyme: false, ord: "C" }, // Carballo Fabian Alberto
  { cuit: "33717904309", te: "3181", seg: false, mipyme: false, ord: "L" }, // Carniceria Brothers x2
  { cuit: "20349758610", te: "3181", seg: false, mipyme: false, ord: "C" }, // Casvin Cristian Andres
  { cuit: "30718161394", te: "3181", seg: false, mipyme: false, ord: "C" }, // Chirin
  { cuit: "20235093287", te: "3184", seg: false, mipyme: false, ord: "C" }, // Diaz Miguens Fernando
  { cuit: "30717554864", te: "3181", seg: false, mipyme: false, ord: "L" }, // E-presis S.A.
  { cuit: "20219816090", te: null,   seg: false, mipyme: false, ord: null }, // Ergas Marcelo Alberto (sin sueldos)
  { cuit: "33719196239", te: "3184", seg: false, mipyme: false, ord: "C" }, // Flor de Azar S.A.
  { cuit: "30718074785", te: "3181", seg: false, mipyme: false, ord: "L" }, // Gastrotecno S.A.
  { cuit: "30716206404", te: "3181", seg: false, mipyme: false, ord: "L" }, // Gb Bazar SA
  { cuit: "30716135124", te: "3181", seg: false, mipyme: false, ord: "L" }, // Gb Metal SA
  { cuit: "20405459036", te: null,   seg: false, mipyme: false, ord: null }, // Gomez Leonardo Nahuel (sin sueldos)
  { cuit: "27388941974", te: "3181", seg: false, mipyme: false, ord: "C" }, // Gonzalez Brenda Ailin
  { cuit: "30718394682", te: "3181", seg: true,  mipyme: false, ord: "L" }, // Green Safety
  { cuit: "30715859145", te: null,   seg: false, mipyme: false, ord: null }, // Gs-tainers S.a (sin sueldos)
  { cuit: "33718970089", te: "3184", seg: false, mipyme: false, ord: "C" }, // Hdx Grupo
  { cuit: "20249628116", te: "3184", seg: false, mipyme: false, ord: "C" }, // Hernan Joaquin
  { cuit: "30643202812", te: "3184", seg: false, mipyme: false, ord: "C" }, // Hexacom SA
  { cuit: "23251342199", te: "3184", seg: false, mipyme: false, ord: "C" }, // Iriarte Joaquin Ramon
  { cuit: "30717679845", te: "3181", seg: false, mipyme: false, ord: "L" }, // J Ame Poderosa SA
  { cuit: "20175238922", te: null,   seg: false, mipyme: false, ord: null }, // Jalil Daniel Omar (sin sueldos)
  { cuit: "30719389240", te: "3184", seg: false, mipyme: false, ord: "C" }, // Kashi SA
  { cuit: "30719184835", te: "3181", seg: false, mipyme: false, ord: "C" }, // Kasur Lipat
  { cuit: "30717680568", te: "3181", seg: false, mipyme: false, ord: "L" }, // Khiro S.A.
  { cuit: "27243142240", te: null,   seg: false, mipyme: false, ord: null }, // Krakovsky Vanina Paola (sin sueldos)
  { cuit: "33716374039", te: null,   seg: false, mipyme: false, ord: null }, // Larsol S.A. (sin sueldos)
  { cuit: "30718524551", te: "3181", seg: false, mipyme: false, ord: "L" }, // Master Kids S.A.
  { cuit: "30717605663", te: "3184", seg: false, mipyme: false, ord: "C" }, // Max Buddy SA
  { cuit: "27175689937", te: "3184", seg: false, mipyme: false, ord: "C" }, // Maximov Mabel Amelia
  { cuit: "30718958934", te: "3184", seg: false, mipyme: false, ord: "C" }, // Maximvs S.r.l
  { cuit: "30718323386", te: "3181", seg: false, mipyme: false, ord: "L" }, // Mazal Dream SA
  { cuit: "20240300835", te: null,   seg: false, mipyme: false, ord: null }, // Melman Pablo Ariel (sin sueldos)
  { cuit: "30717548767", te: "3181", seg: false, mipyme: false, ord: "L" }, // Messenger Consulting SA
  { cuit: "30718374142", te: "3184", seg: false, mipyme: false, ord: "C" }, // Metagame S.A.
  { cuit: "30714871087", te: "3181", seg: false, mipyme: false, ord: "C" }, // Momel S.r.l
  { cuit: "33718009419", te: "3181", seg: false, mipyme: false, ord: "L" }, // Mr Almohada Factory SA
  { cuit: "30717679136", te: "3181", seg: true,  mipyme: false, ord: "L" }, // Mr Factory Couch SA
  { cuit: "30718399803", te: null,   seg: false, mipyme: false, ord: null }, // Mugiwaras SA (sin sueldos)
  { cuit: "30718224582", te: null,   seg: false, mipyme: false, ord: null }, // Multibrod S. A. (sin sueldos)
  { cuit: "30717786986", te: "3181", seg: false, mipyme: false, ord: "C" }, // Ngvs
  { cuit: "20940667497", te: null,   seg: false, mipyme: false, ord: null }, // Nunez Castillejo Angelo (sin sueldos)
  { cuit: "30719105056", te: "3181", seg: false, mipyme: false, ord: "L" }, // Pahue Technologies SA
  { cuit: "30719167094", te: "3181", seg: false, mipyme: false, ord: "C" }, // Pi Consulting
  { cuit: "27219242579", te: null,   seg: false, mipyme: false, ord: null }, // Pinco Debora Patricia (sin sueldos)
  { cuit: "30718922565", te: "3181", seg: false, mipyme: false, ord: "C" }, // Pnr Trade S.A.
  { cuit: "30718581172", te: null,   seg: false, mipyme: false, ord: null }, // Reaj S.A. (sin sueldos)
  { cuit: "30716753251", te: "3181", seg: true,  mipyme: false, ord: "L" }, // Rojot S.A.
  { cuit: "20200123310", te: null,   seg: false, mipyme: false, ord: null }, // Rolon Alejandro Ulises (sin sueldos)
  { cuit: "30714955930", te: "3181", seg: false, mipyme: false, ord: "C" }, // Rr Slot Diseño SRL
  { cuit: "27323899806", te: null,   seg: false, mipyme: false, ord: null }, // Ruffini Alina Soledad (sin sueldos)
  { cuit: "30718310519", te: "3181", seg: false, mipyme: false, ord: "L" }, // Sabenumitubeja S.A.
  { cuit: "20127571083", te: "3181", seg: true,  mipyme: false, ord: "L" }, // Salem Jose Edgardo
  { cuit: "20231269879", te: "3181", seg: false, mipyme: false, ord: "C" }, // Selem David Javier
  { cuit: "30715433490", te: "3181", seg: true,  mipyme: false, ord: "C" }, // Semeca Ingenieria SRL
  { cuit: "20042067696", te: null,   seg: false, mipyme: false, ord: null }, // Setton Jose (sin sueldos)
  { cuit: "23180855459", te: null,   seg: false, mipyme: false, ord: null }, // Sfintzi Isaac Gustavo (sin sueldos)
  { cuit: "30718318161", te: null,   seg: false, mipyme: false, ord: null }, // Si te Dije Que es Toro (sin sueldos)
  { cuit: "20273117890", te: null,   seg: false, mipyme: false, ord: null }, // Sidelnik Mariano Leonel (sin sueldos)
  { cuit: "30718149874", te: "3182", seg: false, mipyme: false, ord: "C" }, // Sigana S.A. (Servicios Eventuales inc.B)
  { cuit: "30714871508", te: "3181", seg: true,  mipyme: false, ord: "C" }, // Smart Solution SRL
  { cuit: "27038698996", te: null,   seg: false, mipyme: false, ord: null }, // Sucesion Azar Alegre Maria (sin sueldos)
  { cuit: "20308861210", te: "3184", seg: false, mipyme: false, ord: "C" }, // Tarrab Jacobo Leandro
  { cuit: "30716025752", te: "3181", seg: true,  mipyme: false, ord: "L" }, // Termomecanica Valtri S.a
  { cuit: "30716787407", te: "3181", seg: false, mipyme: false, ord: "L" }, // Toloki
];

// ── Mapa SOS ID → codigo_lsd (AFIP LSD code) ─────────────────────────────────
// Los valores en la BD usan codigo_lsd (AFIP), no el ID interno de SOS.
const sosToLsd: Record<string, string> = {
  "3180": "0",  // Administración Pública
  "3181": "1",  // Dec 814/01, art. 2, inc. B
  "3182": "2",  // Servicios Eventuales art. 2, inc. B
  "3183": "9",  // Provincias u Otros
  "3184": "4",  // Dec 814/01, art. 2, inc. A
  "3185": "5",  // Servicios Eventuales art. 2, inc. A
  "3187": "7B", // Enseñanza Privada
  "3188": "8",  // Decreto N° 1212/03 AFA CLUBES
};

// ── Obtener mapa codigo_lsd → id de payroll_tipo_empresa ──────────────────────
const tiposRows = await sql<{ id: string; codigo_lsd: string }[]>`
  SELECT id, codigo_lsd FROM payroll_tipo_empresa
`;
const lsdToId = new Map(tiposRows.map((r) => [r.codigo_lsd, r.id]));
const tipoMap = new Map(
  Object.entries(sosToLsd).map(([sos, lsd]) => [sos, lsdToId.get(lsd)])
);
console.log(`✓ ${tipoMap.size} tipos de empresa mapeados (sos→lsd→id)`);

// ── Actualizar clientes ───────────────────────────────────────────────────────
let updated = 0;
let skipped = 0;
let notFound = 0;

for (const emp of empleadorData) {
  // Para empresas sin sueldos configurados en SOS, solo actualizar mipyme y seguro
  // sin tocar tipo_empresa_id ni orden_cln (mantener lo existente)
  if (emp.te === null) {
    const result = await sql`
      UPDATE client
      SET mipyme = ${emp.mipyme}, seguro_colectivo = ${emp.seg}
      WHERE identity_number = ${emp.cuit}
      RETURNING id, name
    `;
    if (result.length > 0) {
      console.log(`  ~ ${result[0].name} (${emp.cuit}) → sin tipo_empresa configurado en SOS`);
      skipped++;
    } else {
      console.log(`  ⚠ CUIT ${emp.cuit} no encontrado en client`);
      notFound++;
    }
    continue;
  }

  const tipoEmpresaId = tipoMap.get(emp.te) ?? null;
  if (!tipoEmpresaId) {
    console.warn(`  ⚠ codigo_sos=${emp.te} no encontrado en payroll_tipo_empresa`);
  }

  const result = await sql`
    UPDATE client
    SET
      tipo_empresa_id  = ${tipoEmpresaId},
      seguro_colectivo = ${emp.seg},
      mipyme           = ${emp.mipyme},
      orden_cln        = ${emp.ord}
    WHERE identity_number = ${emp.cuit}
    RETURNING id, name
  `;

  if (result.length > 0) {
    console.log(`  ✓ ${result[0].name} (${emp.cuit}) → te=${emp.te}, seg=${emp.seg}, mipyme=${emp.mipyme}, ord=${emp.ord}`);
    updated++;
  } else {
    console.log(`  ⚠ CUIT ${emp.cuit} no encontrado en client`);
    notFound++;
  }
}

console.log(`\n✓ Actualización completa:`);
console.log(`  ${updated} clientes actualizados con tipo_empresa`);
console.log(`  ${skipped} clientes sin sueldos en SOS (solo mipyme/seguro actualizados)`);
console.log(`  ${notFound} CUITs no encontrados en nuestra BD`);

await sql.end();
