/**
 * Genera `drizzle/schema.ts` a partir de la introspección de BD_IDEAL.
 *
 * El schema ideal se define en SQL (`src/scripts/ideal/schema-dominio*.sql`), así que
 * el TypeScript de Drizzle es un derivado: se regenera, no se edita a mano.
 *
 *   bunx drizzle-kit pull --config drizzle.ideal.config.ts
 *   bun src/scripts/ideal/gen-schema.ts
 *
 * Sobre la salida cruda de drizzle-kit se aplican tres arreglos:
 *  1. Las tablas de Better Auth se importan de `./auth` (las define el plugin, no nosotros).
 *  2. `mode: 'string'` fuera: la app trabaja con `Date`, como el schema anterior.
 *  3. Encabezado con la advertencia de que el archivo es generado.
 */
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '../../..');
const ENTRADA = path.join(ROOT, 'drizzle-ideal/schema.ts');
const SALIDA = path.join(ROOT, 'drizzle/schema.ts');

/** Tablas que ya viven en `drizzle/auth.ts`. */
const TABLAS_AUTH = [
  'user',
  'session',
  'account',
  'verification',
  'organization',
  'member',
  'invitation',
];

const main = async () => {
  let src = await Bun.file(ENTRADA).text();

  // 1. Sacar las definiciones de auth y dejarlas como import.
  const bloque =
    /export const (\w+) = pgTable\("([a-z_]+)"[\s\S]*?\n\}(?:, \(table\) => \[[\s\S]*?\n\])?\);\n\n?/g;
  const sacadas: string[] = [];
  src = src.replace(bloque, (todo, _constName, tabla: string) => {
    if (!TABLAS_AUTH.includes(tabla)) return todo;
    sacadas.push(tabla);
    return '';
  });
  const faltan = TABLAS_AUTH.filter((t) => !sacadas.includes(t));
  if (faltan.length > 0)
    throw new Error(`No se encontraron las tablas de auth: ${faltan.join(', ')}`);

  // 2. Timestamps como Date, no como string.
  src = src
    .replace(/, \{ withTimezone: true, mode: 'string' \}/g, ', { withTimezone: true }')
    .replace(/, \{ mode: 'string' \}/g, '');

  // 3. Encabezado + import de auth (sólo las que quedaron referenciadas por alguna FK).
  const usadas = TABLAS_AUTH.filter((t) =>
    new RegExp(`foreignColumns: \\[${t}\\.`).test(src)
  );
  src = src.replace(
    /^(import \{[\s\S]*?\} from "drizzle-orm\/pg-core"\nimport \{ sql \} from "drizzle-orm")/,
    `$1\nimport { ${usadas.join(', ')} } from "./auth"`
  );

  const encabezado = `/**
 * GENERADO — no editar a mano.
 *
 * Fuente de verdad: el SQL de BD_IDEAL (src/scripts/ideal/schema-dominio*.sql).
 * Para regenerar:
 *   bunx drizzle-kit pull --config drizzle.ideal.config.ts
 *   bun src/scripts/ideal/gen-schema.ts
 */
`;

  await Bun.write(SALIDA, encabezado + src.trimStart() + '\n');

  const tablas = [...src.matchAll(/= pgTable\("([a-z_]+)"/g)].length;
  const enums = [...src.matchAll(/= pgEnum\("([a-z_]+)"/g)].length;
  console.log(`drizzle/schema.ts: ${tablas} tablas, ${enums} enums`);
  console.log(`auth importado de ./auth: ${sacadas.length} tablas`);
};

await main();
