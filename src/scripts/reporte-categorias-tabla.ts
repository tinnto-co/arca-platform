import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const rows = await sql`
  SELECT
    p.name as empresa,
    e.nombre,
    e.categoria as texto_original,
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

// Anchos de columna
const col = {
  empresa:   28,
  nombre:    35,
  texto:     26,
  codigo:    8,
  escala:    22,
  override:  14,
};

const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
const sep = '-'.repeat(col.empresa + col.nombre + col.texto + col.codigo + col.escala + col.override + 13);

console.log(sep);
console.log(
  '| ' + pad('Empresa', col.empresa) +
  '| ' + pad('Empleado', col.nombre) +
  '| ' + pad('Texto original', col.texto) +
  '| ' + pad('Código', col.codigo) +
  '| ' + pad('Categoría escala', col.escala) +
  '| ' + pad('Override', col.override) + '|'
);
console.log(sep);

for (const r of rows) {
  const override = r.override_actual
    ? '$' + Math.round(Number(r.override_actual)).toLocaleString('es-AR')
    : '—  usa escala';
  console.log(
    '| ' + pad(r.empresa, col.empresa) +
    '| ' + pad(r.nombre, col.nombre) +
    '| ' + pad(r.texto_original ?? '', col.texto) +
    '| ' + pad(r.cat_codigo, col.codigo) +
    '| ' + pad(r.cat_nombre, col.escala) +
    '| ' + pad(override, col.override) + '|'
  );
}

console.log(sep);
const usanEscala = rows.filter((r: any) => !r.override_actual).length;
console.log(`Total: ${rows.length} | Usan escala: ${usanEscala} | Con override: ${rows.length - usanEscala}`);

await sql.end();
process.exit(0);
