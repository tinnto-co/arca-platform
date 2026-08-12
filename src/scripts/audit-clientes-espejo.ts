/**
 * Candidatos a baja: filas de `client` que son "espejo" del representante
 * (mismo CUIT que su representative) y que NO figuran como cliente en la planilla del estudio.
 * Solo lectura: imprime el listado con el volumen de datos que colgaría de cada uno.
 *
 * Uso: source .env && bun run src/scripts/audit-clientes-espejo.ts "/path/planilla.csv"
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Falta el path del CSV de la planilla");

const norm = (s: string) => (s ?? "").replace(/\D/g, "");
const csvLines = readFileSync(csvPath, "utf8").split("\n");
const cuitRow = csvLines.find((l) => l.startsWith("Cuit,"))!.split(",");
const planillaCuits = new Set(cuitRow.slice(1).map(norm).filter(Boolean));

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

const rows = await sql`
  select c.id, c.name, c.identity_number, r.name as rep_name,
    (select count(*)::int from invoice i where i.client_id = c.id) as facturas,
    (select count(*)::int from iva_scrape s where s.client_id = c.id) as iva,
    (select count(*)::int from notification n where n.client_id = c.id) as notif,
    (select count(*)::int from liquidacion_import_empleado e where e.client_id = c.id) as empleados,
    (select count(*)::int from journal_entry j where j.client_id = c.id) as asientos,
    (select count(*)::int from debt d where d.client_id = c.id) as deudas,
    (select count(*)::int from client c2 where c2.representative_id = c.representative_id) as clients_del_rep
  from client c
  join representative r on r.id = c.representative_id
  where regexp_replace(c.identity_number, '\\D', '', 'g') = regexp_replace(r.cuit, '\\D', '', 'g')
  order by facturas desc
`;

const candidatos = rows.filter((r) => !planillaCuits.has(norm(r.identity_number)));
const enPlanilla = rows.filter((r) => planillaCuits.has(norm(r.identity_number)));

console.log("espejo total:", rows.length);
console.log("espejo que SÍ es cliente en la planilla (NO tocar):", enPlanilla.length);
console.log("candidatos a baja:", candidatos.length);

console.table(
  candidatos.map((r) => ({
    name: r.name,
    cuit: r.identity_number,
    facturas: r.facturas,
    iva: r.iva,
    notif: r.notif,
    empleados: r.empleados,
    asientos: r.asientos,
    deudas: r.deudas,
    otras_empresas_del_rep: r.clients_del_rep - 1,
  })),
);

const conPayroll = candidatos.filter((r) => r.empleados > 0 || r.asientos > 0);
if (conPayroll.length) {
  console.log("\n!! REVISAR: candidatos con sueldos o contabilidad cargada (probablemente sí son clientes):");
  for (const r of conPayroll)
    console.log(`  - ${r.name} (${r.identity_number}) empleados=${r.empleados} asientos=${r.asientos}`);
}

const huerfanos = candidatos.filter((r) => r.clients_del_rep === 1);
if (huerfanos.length) {
  console.log("\n!! REVISAR: candidatos que son el ÚNICO client de su representante (si se borran, el rep queda sin nada):");
  for (const r of huerfanos) console.log(`  - ${r.name} (${r.identity_number})`);
}

console.log("\nTotales que se borrarían por cascade:");
console.log("  facturas:", candidatos.reduce((a, r) => a + r.facturas, 0));
console.log("  iva_scrape:", candidatos.reduce((a, r) => a + r.iva, 0));
console.log("  notificaciones:", candidatos.reduce((a, r) => a + r.notif, 0));

await sql.end();
