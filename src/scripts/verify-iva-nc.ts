/**
 * Verificación del cálculo de IVA contra los datos scrapeados de AFIP (F2051).
 *
 * Corre `calcularIva` sobre los comprobantes reales de cada período con dato en
 * `iva_declaracion` y reporta cuántos débitos/créditos coinciden. Es el control
 * objetivo del cálculo: la declaración de AFIP es la verdad.
 *
 * Uso: bun run src/scripts/verify-iva-nc.ts
 *      (contra BD_IDEAL; IDEAL_DATABASE_URL o DATABASE_URL)
 */
import postgres from 'postgres';
import { calcularIva, type ComprobanteAlicuotaRow } from '../lib/iva-calc';

const url = process.env.IDEAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Falta IDEAL_DATABASE_URL / DATABASE_URL');
const sql = postgres(url, { ssl: false, max: 2 });

const declaraciones = await sql<
  {
    cliente_id: string;
    razon_social: string;
    periodo: string;
    debito_fiscal: string;
    credito_fiscal: string;
  }[]
>`
  select d.cliente_id, c.razon_social, to_char(d.periodo, 'YYYY-MM') as periodo,
         d.debito_fiscal, d.credito_fiscal
  from iva_declaracion d
  join cliente c on c.id = d.cliente_id
  where d.debito_fiscal is not null and d.credito_fiscal is not null
  order by c.razon_social, d.periodo
`;

const near = (a: number, b: number) => Math.abs(a - b) < 1;
let debOk = 0;
let credOk = 0;
const conNc: string[] = [];

for (const d of declaraciones) {
  const rows = await sql<ComprobanteAlicuotaRow[]>`
    select c.direccion, t.letra, t.es_nc as "esNc", c.moneda, c.cotizacion,
           a.alicuota, a.neto, a.iva
    from comprobante_alicuota a
    join comprobante c on c.id = a.comprobante_id
    join comprobante_tipo t on t.codigo = c.tipo
    where c.cliente_id = ${d.cliente_id}
      and to_char(c.periodo, 'YYYY-MM') = ${d.periodo}
  `;
  const r = calcularIva(rows);
  const dOk = near(r.debitoFiscal, Number(d.debito_fiscal));
  const cOk = near(r.creditoFiscalCompras, Number(d.credito_fiscal));
  if (dOk) debOk++;
  if (cOk) credOk++;
  if (r.ncRecibidasIva !== 0 || r.ncEmitidasIva !== 0) {
    conNc.push(
      `${d.razon_social.slice(0, 24).padEnd(24)} ${d.periodo}  ` +
        `deb afip ${Number(d.debito_fiscal).toFixed(2).padStart(14)} calc ${r.debitoFiscal.toFixed(2).padStart(14)} ${dOk ? 'OK' : '  '}  ` +
        `cred afip ${Number(d.credito_fiscal).toFixed(2).padStart(14)} calc ${r.creditoFiscalCompras.toFixed(2).padStart(14)} ${cOk ? 'OK' : ''}`
    );
  }
}

console.log('--- Períodos con notas de crédito ---');
console.log(conNc.join('\n'));
console.log(`\nTotal períodos comparados: ${declaraciones.length}`);
console.log(`Débito coincide con AFIP:  ${debOk}/${declaraciones.length}`);
console.log(`Crédito coincide con AFIP: ${credOk}/${declaraciones.length}`);

await sql.end();
