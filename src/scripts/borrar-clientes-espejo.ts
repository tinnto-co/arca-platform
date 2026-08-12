/**
 * Fase 3 de la limpieza de perfiles espejo: borrado de las filas de `client`
 * que son espejo del representante (mismo CUIT) y NO figuran en la planilla.
 *
 * Prerrequisitos: fase 1 aplicada (fix-clientes-mal-cargados.ts) y fase 2
 * corrida (export-clientes-espejo.ts — backup JSON de primer nivel).
 *
 * Este script además:
 *  - exporta a JSON las filas de SEGUNDO nivel afectadas (invoice_attachment,
 *    bank_invoice_match, payroll_convenio_categoria/fuente, payroll_escala),
 *    que el export de fase 2 no cubre;
 *  - chequea el bloqueo RESTRICT (liquidacion_import_empleado.convenio_id →
 *    payroll_convenio de un espejo) y ABORTA si existe;
 *  - borra primero invoice_attachment (FK NO ACTION a notification) y después
 *    los client (el resto cascadea).
 *
 * Dry-run por defecto. Para escribir: --apply.
 * Uso: source .env && bun run src/scripts/borrar-clientes-espejo.ts "/path/planilla.csv" /path/dir-backup [--apply]
 */
import postgres from "postgres";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const csvPath = process.argv[2];
const outDir = process.argv[3];
const apply = process.argv.includes("--apply");
if (!csvPath || !outDir) throw new Error("Uso: <planilla.csv> <dir-backup> [--apply]");

const norm = (s: string) => (s ?? "").replace(/\D/g, "");
const cuitRow = readFileSync(csvPath, "utf8").split("\n").find((l) => l.startsWith("Cuit,"))!.split(",");
const planillaCuits = new Set(cuitRow.slice(1).map(norm).filter(Boolean));

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

// --- Target set (misma definición que fases anteriores) ---
const espejo = await sql`
  select c.id, c.name, c.identity_number
  from client c
  join representative r on r.id = c.representative_id
  where regexp_replace(c.identity_number, '\\D', '', 'g') = regexp_replace(r.cuit, '\\D', '', 'g')
`;
const targets = espejo.filter((c) => !planillaCuits.has(norm(c.identity_number)));
const ids = targets.map((c) => c.id);

console.log(`Candidatos a borrar: ${targets.length}`);
if (targets.length !== 42) {
  console.error(`!! Se esperaban 42, hay ${targets.length}. ABORTADO — revisar antes de seguir.`);
  await sql.end();
  process.exit(1);
}

// --- Bloqueo RESTRICT: empleados que referencian convenios de los targets ---
const bloqueados = await sql`
  select e.id, e.client_id, p.client_id as convenio_client_id, p.nombre as convenio
  from liquidacion_import_empleado e
  join payroll_convenio p on p.id = e.convenio_id
  where p.client_id = any(${ids})
`;
if (bloqueados.length > 0) {
  console.error(`!! ${bloqueados.length} empleados referencian convenios de espejos (FK RESTRICT). ABORTADO.`);
  console.table(bloqueados.map((r) => ({ ...r })));
  await sql.end();
  process.exit(1);
}
console.log("Chequeo RESTRICT (empleados → convenios de espejos): OK, 0 filas");

// --- Segundo nivel afectado ---
const attachments = await sql`
  select a.* from invoice_attachment a
  join notification n on n.id = a.notification_id
  where n.client_id = any(${ids})
`;
const matches = await sql`
  select m.* from bank_invoice_match m
  join invoice i on i.id = m.invoice_id
  where i.client_id = any(${ids})
`;
const categorias = await sql`
  select pc.* from payroll_convenio_categoria pc
  join payroll_convenio p on p.id = pc.convenio_id
  where p.client_id = any(${ids})
`;
const escalas = await sql`
  select es.* from payroll_escala es
  join payroll_convenio_categoria pc on pc.id = es.categoria_id
  join payroll_convenio p on p.id = pc.convenio_id
  where p.client_id = any(${ids})
`;
const fuentes = await sql`
  select f.* from payroll_convenio_fuente f
  join payroll_convenio p on p.id = f.convenio_id
  where p.client_id = any(${ids})
`;

console.log("\nSegundo nivel afectado:");
console.table({
  invoice_attachment: attachments.length,
  bank_invoice_match: matches.length,
  payroll_convenio_categoria: categorias.length,
  payroll_escala: escalas.length,
  payroll_convenio_fuente: fuentes.length,
});

mkdirSync(outDir, { recursive: true });
const backupFile = join(outDir, "clientes-espejo-segundo-nivel.json");
writeFileSync(
  backupFile,
  JSON.stringify(
    {
      invoice_attachment: attachments,
      bank_invoice_match: matches,
      payroll_convenio_categoria: categorias,
      payroll_escala: escalas,
      payroll_convenio_fuente: fuentes,
    },
    null,
    2,
  ),
);
console.log(`Backup segundo nivel: ${backupFile}`);

if (!apply) {
  console.log("\nDRY-RUN. Volver a correr con --apply para borrar.");
  await sql.end();
  process.exit(0);
}

// --- Borrado ---
const before = (await sql`select count(*)::int as n from client`)[0].n;
await sql.begin(async (tx) => {
  const delAtt = await tx`
    delete from invoice_attachment a
    using notification n
    where n.id = a.notification_id and n.client_id = any(${ids})
  `;
  console.log(`invoice_attachment borrados: ${delAtt.count}`);
  const delClients = await tx`delete from client where id = any(${ids})`;
  console.log(`client borrados: ${delClients.count}`);
  if (delClients.count !== 42) throw new Error(`Se esperaban 42 deletes de client, hubo ${delClients.count} — ROLLBACK`);
});
const after = (await sql`select count(*)::int as n from client`)[0].n;
console.log(`\nHecho. client: ${before} -> ${after}`);

const restantes = await sql`
  select count(*)::int as n
  from client c join representative r on r.id = c.representative_id
  where regexp_replace(c.identity_number, '\\D', '', 'g') = regexp_replace(r.cuit, '\\D', '', 'g')
`;
console.log(`Espejos restantes (deberían ser 15, los de la planilla): ${restantes[0].n}`);

await sql.end();
