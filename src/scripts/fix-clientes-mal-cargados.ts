/**
 * Fase 1 de la limpieza de perfiles espejo: correcciones de datos previas al borrado.
 *
 *  1. Alta de `client` BazarSale S.A. (30718926951) bajo el representante Esteban Poles.
 *     Hoy la única fila de ese representante es el espejo "BAZARSALE S.A. / 27218315661"
 *     (el CUIT de la persona), que se borra en la Fase 3.
 *  2. Renombrar el representante 20443663534, que hoy tiene `name = null`.
 *
 * Dry-run por defecto. Para escribir: pasar --apply.
 * Uso: source .env && bun run src/scripts/fix-clientes-mal-cargados.ts [--apply]
 */
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

const BAZARSALE = {
  repCuit: "27218315661",
  cuit: "30718926951",
  name: "BAZARSALE S.A.",
};
const REP_SIN_NOMBRE = { cuit: "20443663534", name: "SFINTZI ALAN GADIEL" };

const plan: { desc: string; run: () => Promise<void> }[] = [];

// --- 1. BazarSale S.A. ---
const [rep] = await sql`
  select id, name from representative
  where regexp_replace(cuit, '\\D', '', 'g') = ${BAZARSALE.repCuit}
`;
if (!rep) throw new Error(`No existe el representante ${BAZARSALE.repCuit}`);

const dup = await sql`
  select c.id, c.name, r.name as rep
  from client c join representative r on r.id = c.representative_id
  where regexp_replace(c.identity_number, '\\D', '', 'g') = ${BAZARSALE.cuit}
`;
if (dup.length > 0) {
  console.log(`[skip] ${BAZARSALE.cuit} ya existe como client:`, dup.map((d) => `${d.name} (rep ${d.rep})`));
} else {
  plan.push({
    desc: `crear client "${BAZARSALE.name}" (${BAZARSALE.cuit}) bajo representante "${rep.name}"`,
    run: async () => {
      await sql`
        insert into client (representative_id, name, identity_number, identity_type, address, phone, email, status)
        values (${rep.id}, ${BAZARSALE.name}, ${BAZARSALE.cuit}, 'cuit', '', '', '', 'active')
      `;
    },
  });
}

// --- 2. Representante sin nombre ---
const [repSinNombre] = await sql`
  select id, name from representative
  where regexp_replace(cuit, '\\D', '', 'g') = ${REP_SIN_NOMBRE.cuit}
`;
if (!repSinNombre) {
  console.log(`[skip] no existe el representante ${REP_SIN_NOMBRE.cuit}`);
} else if (repSinNombre.name) {
  console.log(`[skip] el representante ${REP_SIN_NOMBRE.cuit} ya se llama "${repSinNombre.name}"`);
} else {
  plan.push({
    desc: `renombrar representante ${REP_SIN_NOMBRE.cuit}: null -> "${REP_SIN_NOMBRE.name}"`,
    run: async () => {
      await sql`update representative set name = ${REP_SIN_NOMBRE.name} where id = ${repSinNombre.id}`;
    },
  });
}

console.log(`\nCambios a aplicar (${plan.length}):`);
for (const p of plan) console.log(`  - ${p.desc}`);

if (plan.length === 0) {
  console.log("\nNada que hacer.");
} else if (!apply) {
  console.log("\nDRY-RUN. Volver a correr con --apply para escribir.");
} else {
  const before = (await sql`select count(*)::int as n from client`)[0].n;
  await sql.begin(async () => {
    for (const p of plan) await p.run();
  });
  const after = (await sql`select count(*)::int as n from client`)[0].n;
  console.log(`\nAplicado. client: ${before} -> ${after}`);

  const check = await sql`
    select c.name, c.identity_number, r.name as rep
    from client c join representative r on r.id = c.representative_id
    where regexp_replace(c.identity_number, '\\D', '', 'g') = ${BAZARSALE.cuit}
  `;
  console.table(check.map((r) => ({ ...r })));

  const dups = await sql`
    select regexp_replace(identity_number, '\\D', '', 'g') as cuit, count(*)::int as n
    from client group by 1 having count(*) > 1
  `;
  console.log("CUITs duplicados en client:", dups.length);
  if (dups.length > 0) console.table(dups.map((r) => ({ ...r })));
}

await sql.end();
