/**
 * Agrega al catálogo `comprobante_tipo` la familia de liquidaciones y cuentas de
 * venta (60, 61, 63, 64), que faltaba desde el seed original.
 *
 * Por qué: `importarZipComprobantes` aborta la importación completa de un perfil
 * si encuentra un código fuera del catálogo. Un ZIP de recibidos con un
 * comprobante 63 dejaba las compras en cero — y con ellas el crédito fiscal —
 * mostrando una posición de IVA equivocada por un orden de magnitud
 * (Termomecanica Valtri, julio 2026: saldo en pantalla 50.327.916,47 contra
 * 11.196.977,36 real).
 *
 * Idempotente: `on conflict do nothing`. Refleja lo que ya quedó en
 * `schema-dominio2.sql`, que es la fuente de verdad.
 *
 *   bun src/scripts/ideal/agregar-tipos-liquidacion.ts            # simula
 *   bun src/scripts/ideal/agregar-tipos-liquidacion.ts --apply
 */
import postgres from 'postgres';

const APLICAR = process.argv.includes('--apply');
const base = process.env.IDEAL_DATABASE_REMOTE;
if (!base) {
  console.error('Falta IDEAL_DATABASE_REMOTE en el entorno.');
  process.exit(1);
}

const sql = postgres(base.replace(/\/[^/]+$/, '/contable'), {
  max: 1,
  connect_timeout: 15,
  onnotice: () => {},
});

// letra, clase, es_nc, discrimina_iva — `clase` no interviene en ningún cálculo.
const TIPOS = [
  [60, 'Cuenta de Venta y Líquido producto A', 'A', 'factura', false, true],
  [61, 'Cuenta de Venta y Líquido producto B', 'B', 'factura', false, false],
  [63, 'Liquidación A', 'A', 'factura', false, true],
  [64, 'Liquidación B', 'B', 'factura', false, false],
] as const;

try {
  const previos = new Set(
    (
      (await sql`select codigo from comprobante_tipo`) as unknown as {
        codigo: number;
      }[]
    ).map((r) => Number(r.codigo))
  );

  const faltan = TIPOS.filter((t) => !previos.has(t[0]));
  const [{ n: antes }] = (await sql`
    select count(*)::int n from comprobante_tipo
  `) as unknown as { n: number }[];

  console.log(`catálogo actual: ${antes} códigos`);
  console.log(`de los 4 de liquidación, faltan ${faltan.length}:`);
  for (const t of faltan) console.log(`   ${t[0]} · ${t[1]}`);

  if (!faltan.length) {
    console.log('\nNada que hacer: ya están los cuatro.');
  } else if (!APLICAR) {
    console.log('\n(simulación — no se escribió nada; usá --apply)');
  } else {
    for (const [
      codigo,
      descripcion,
      letra,
      clase,
      esNc,
      discrimina,
    ] of faltan) {
      await sql`
        insert into comprobante_tipo
          (codigo, descripcion, letra, clase, es_nc, discrimina_iva)
        values
          (${codigo}, ${descripcion}, ${letra}, ${clase}::comprobante_clase,
           ${esNc}, ${discrimina})
        on conflict (codigo) do nothing
      `;
    }
    const [{ n: despues }] = (await sql`
      select count(*)::int n from comprobante_tipo
    `) as unknown as { n: number }[];
    console.log(`\n✓ aplicado. catálogo: ${antes} → ${despues} códigos`);
  }
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
