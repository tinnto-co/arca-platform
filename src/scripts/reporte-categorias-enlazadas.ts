import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const rows = await sql`
  SELECT
    p.name as empresa,
    e.nombre,
    e.categoria as texto_categoria,
    pcc.codigo as cat_codigo,
    pcc.nombre as cat_nombre,
    e.valor_sueldo as override_actual
  FROM liquidacion_import_empleado e
  JOIN profile p ON p.id = e.profile_id
  JOIN payroll_convenio pc ON pc.id = e.convenio_id
  JOIN payroll_convenio_categoria pcc ON pcc.id = e.categoria_id
  WHERE pc.cct_codigo = '130/75'
  ORDER BY p.name, pcc.codigo, e.nombre
`;

let empresa = '';
for (const r of rows) {
  if (r.empresa !== empresa) {
    console.log('\n[' + r.empresa + ']');
    empresa = r.empresa;
  }
  const override = r.override_actual
    ? ' (override: $' + Math.round(Number(r.override_actual)) + ')'
    : ' → usa escala automaticamente';
  const texto = r.texto_categoria ? '"' + r.texto_categoria + '"' : 'sin texto';
  console.log('  ' + r.nombre + ' | ' + texto + ' → ' + r.cat_codigo + ' ' + r.cat_nombre + override);
}

console.log('\nTotal con categoria_id enlazada: ' + rows.length);

// Cuántos usan escala vs override
const usanEscala = rows.filter((r: any) => !r.override_actual).length;
const conOverride = rows.filter((r: any) => !!r.override_actual).length;
console.log('Usan escala automatica: ' + usanEscala);
console.log('Tienen override manual: ' + conOverride);

await sql.end();
process.exit(0);
