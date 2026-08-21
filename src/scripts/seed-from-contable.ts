/**
 * Copia las tablas esenciales de contable → arca_ideal local.
 * Solo para bootstrap del entorno de desarrollo.
 * Uso: bun src/scripts/seed-from-contable.ts
 */
import postgres from "postgres";

const SRC_URL =
  "postgres://arca_agent:054195b9cb24758f6250fb6984da27a6@77.42.70.84:6001/contable";
const DST_URL =
  process.env.IDEAL_DATABASE_URL ?? "postgres://arca:arca@localhost:5460/arca_ideal";
const ORG_ID = "org_estudio_blakg";

const src = postgres(SRC_URL, {
  max: 1,
  prepare: false,
  connection: { "app.org_id": ORG_ID },
});
const dst = postgres(DST_URL, { max: 1, prepare: false });

async function copyTable(table: string, extraWhere = "") {
  const rows = await src.unsafe(
    `SELECT * FROM "${table}"${extraWhere ? ` WHERE ${extraWhere}` : ""}`
  );
  if (rows.length === 0) {
    console.log(`  ${table}: 0 filas`);
    return;
  }
  await dst.unsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vals = chunk.map((row) => cols.map((c) => (row as Record<string, unknown>)[c]));
    const placeholders = vals
      .map(
        (_, ri) =>
          `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(", ")})`
      )
      .join(", ");
    await dst.unsafe(
      `INSERT INTO "${table}" (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      vals.flat() as unknown[]
    );
    inserted += chunk.length;
  }
  console.log(`  ${table}: ${inserted} filas`);
}

console.log(`→ Copiando datos de contable → arca_ideal (org: ${ORG_ID})...`);

// 1. Auth: orden respeta FKs
await copyTable("organization");
await copyTable("user");
await copyTable("account");
await copyTable("session");
await copyTable("verification");
await copyTable("member");
await copyTable("invitation");

// 2. Core negocio
await copyTable("credencial_afip");
await copyTable("cliente");
await copyTable("cliente_credencial");
await copyTable("cliente_empleador_config");
await copyTable("tipo_empresa");
await copyTable("obra_social");
await copyTable("zona");
await copyTable("provincia");
await copyTable("localidad");
await copyTable("nacionalidad");
await copyTable("situacion_revista");
await copyTable("condicion_trabajador");
await copyTable("modalidad_contratacion");
await copyTable("siniestrado");
await copyTable("actividad");
await copyTable("cct");
await copyTable("cct_fuente");
await copyTable("convenio");
await copyTable("convenio_categoria");
await copyTable("concepto_afip");
await copyTable("base_calculo");
await copyTable("concepto");
await copyTable("base_calculo_concepto");
await copyTable("cliente_concepto");
await copyTable("cliente_cct");
await copyTable("escala_salarial");
await copyTable("empleado");
await copyTable("recibo");
await copyTable("recibo_concepto");
await copyTable("parametro_periodo");

console.log("\n✓ Seed completado.");

await src.end();
await dst.end();
