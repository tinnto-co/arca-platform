/**
 * Repara el hueco de `iva_declaracion` en `contable`.
 *
 * Contexto: tras el cutover del 12/08, `contable` quedó con 0 declaraciones de
 * IVA mientras que `arca_staging` (el entorno de v2, mismo modelo ideal) tiene
 * 297. La causa exacta no se pudo determinar — `etl-dominio2.ts` trunca
 * `iva_declaracion` al arrancar (línea 49), así que una corrida parcial la deja
 * vacía sin dejar rastro. Lo que sí se verificó:
 *
 *   - los 73 cliente_id con IVA existen en `contable` con el MISMO uuid;
 *   - `arca_staging` y la base vieja coinciden en 297 filas (mismo conjunto);
 *   - las filas de `arca_staging` ya están en el modelo ideal: no hay mapeo.
 *
 * Por eso la reparación copia de `arca_staging` en vez de re-correr el ETL:
 * sin transformación no hay nada que salga mal en la traducción.
 *
 * Simula por defecto. Para escribir de verdad: --apply
 *
 *   bun src/scripts/ideal/reparar-iva-contable.ts
 *   bun src/scripts/ideal/reparar-iva-contable.ts --apply
 */
import postgres from 'postgres';

const APLICAR = process.argv.includes('--apply');

const base = process.env.IDEAL_DATABASE_REMOTE;
if (!base) {
  console.error('Falta IDEAL_DATABASE_REMOTE en el entorno.');
  process.exit(1);
}

const urlDe = (db: string) => base.replace(/\/[^/]+$/, `/${db}`);

const origen = postgres(urlDe('arca_staging'), {
  max: 1,
  connect_timeout: 15,
  onnotice: () => {},
});
const destino = postgres(urlDe('contable'), {
  max: 1,
  connect_timeout: 15,
  onnotice: () => {},
});

type Fila = Record<string, unknown>;

try {
  const filas = (await origen`
    select * from iva_declaracion order by cliente_id, periodo
  `) as unknown as Fila[];
  console.log(`origen (arca_staging): ${filas.length} declaraciones`);

  const [{ n: yaHay }] = (await destino`
    select count(*)::int n from iva_declaracion
  `) as unknown as { n: number }[];
  console.log(`destino (contable):    ${yaHay} declaraciones`);

  // Guard: si el destino ya tiene datos, esto no es el escenario para el que
  // se escribió el script. Frenamos antes de duplicar nada.
  if (yaHay > 0) {
    console.error(
      '\n⚠ `contable` ya tiene declaraciones. Este script asume la tabla vacía.\n' +
        '  Revisá a mano antes de seguir: puede que alguien ya la haya reparado\n' +
        '  o que el scrapper haya empezado a escribir.'
    );
    process.exit(1);
  }

  // Sólo copiamos filas cuyo cliente exista en el destino: una FK rota abortaría
  // la transacción entera y dejaría el trabajo a medias.
  const idsCliente = [...new Set(filas.map((f) => String(f.cliente_id)))];
  const presentes = new Set(
    (
      (await destino`
        select id from cliente where id = any(${destino.array(idsCliente)}::uuid[])
      `) as unknown as { id: string }[]
    ).map((c) => c.id)
  );

  const copiables = filas.filter((f) => presentes.has(String(f.cliente_id)));
  const huerfanas = filas.length - copiables.length;

  console.log(`\nclientes con IVA en origen: ${idsCliente.length}`);
  console.log(`  presentes en contable:    ${presentes.size}`);
  console.log(`declaraciones a copiar:     ${copiables.length}`);
  if (huerfanas > 0) {
    console.log(`  ⚠ descartadas por cliente inexistente: ${huerfanas}`);
  }

  // `periodo` es una columna date: vuelve como Date, no como string. Ordenarlo
  // como texto da un rango sin sentido — hay que normalizar a ISO primero.
  const iso = (v: unknown) =>
    v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const periodos = copiables.map((f) => iso(f.periodo)).sort();
  console.log(
    `rango de períodos: ${periodos[0]} → ${periodos[periodos.length - 1]}`
  );

  if (!APLICAR) {
    console.log('\n(simulación — no se escribió nada; usá --apply)');
  } else {
    await destino.begin(async (tx) => {
      // insertChunked casero: 297 filas entran cómodas, pero el chunk evita
      // sorpresas si el conjunto crece.
      for (let i = 0; i < copiables.length; i += 200) {
        const lote = copiables.slice(i, i + 200);
        await tx`insert into iva_declaracion ${tx(lote)}`;
      }
    });
    const [{ n: final }] = (await destino`
      select count(*)::int n from iva_declaracion
    `) as unknown as { n: number }[];
    console.log(`\n✓ aplicado. contable ahora tiene ${final} declaraciones.`);
    if (final !== copiables.length) {
      console.error(
        `⚠ se esperaban ${copiables.length}; revisá antes de dar por cerrado.`
      );
      process.exitCode = 1;
    }
  }
} finally {
  await origen.end({ timeout: 5 }).catch(() => {});
  await destino.end({ timeout: 5 }).catch(() => {});
}
