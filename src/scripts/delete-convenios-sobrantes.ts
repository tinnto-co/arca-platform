import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

// Convenios a borrar: 
//  - La empresa SÍ tiene datos en AFIP (fue scrapeada)
//  - Pero ningún registro AFIP coincide con el cct_codigo del convenio
//  - Y no tiene empleados vinculados (protect por restrict)
const aEliminar = await sql`
  SELECT pc.id, pc.cct_codigo, p.name, p.identity_number
  FROM payroll_convenio pc
  JOIN profile p ON p.client_id = pc.client_id
  -- La empresa tiene al menos un registro en AFIP
  WHERE EXISTS (
    SELECT 1 FROM afip_empleadores_convenio aec WHERE aec.profile_id = p.id
  )
  -- Pero ninguno coincide con este CCT
  AND NOT EXISTS (
    SELECT 1 FROM afip_empleadores_convenio aec
    WHERE aec.profile_id = p.id
    AND REGEXP_REPLACE(aec.cct, '^0+', '') = pc.cct_codigo
  )
  -- Sin empleados vinculados
  AND NOT EXISTS (
    SELECT 1 FROM liquidacion_import_empleado e WHERE e.convenio_id = pc.id
  )
  ORDER BY p.name, pc.cct_codigo
`;

console.log(`Convenios a eliminar: ${aEliminar.length}\n`);
for (const r of aEliminar) {
  console.log(`  ${r.name} | CUIT: ${r.identity_number} | CCT: ${r.cct_codigo} | id: ${r.id}`);
}

if (aEliminar.length === 0) {
  console.log('Nada para borrar.');
  await sql.end();
  process.exit(0);
}

const ids = aEliminar.map(r => r.id);

// Borrar de a uno para mayor control
let eliminados = 0;
for (const id of ids) {
  await sql`DELETE FROM payroll_convenio WHERE id = ${id}`;
  eliminados++;
  process.stdout.write(`\r  Eliminados: ${eliminados}/${ids.length}`);
}

console.log(`\n\n[ok] ${eliminados} convenios eliminados.`);
await sql.end();
