/**
 * Script: seed-topes-2026.ts
 *
 * Carga los topes máximos imponibles (base imponible máxima SIPA) para todos
 * los meses disponibles de 2026, usando valores oficiales publicados por ANSES
 * vía resoluciones mensuales.
 *
 * Los valores provienen de fuentes especializadas (ignacioonline.com.ar,
 * siap.blogdelcontador.com.ar) que reproducen los datos oficiales de ANSES.
 *
 * Se usa este script hardcodeado porque la página de ANSES está protegida por
 * Incapsula WAF y no es accesible mediante fetch automatizado.
 *
 * Uso:
 *   bun run src/scripts/seed-topes-2026.ts
 *
 * Es idempotente (upsert). Se puede correr más de una vez sin problema.
 * Actualizar TOPES_2026 cuando ANSES publique los valores de meses futuros.
 */

import { db } from '@/lib/db';
import { payrollParametrosPeriodo } from '@/drizzle/schema';

const FUENTE = 'ANSES - Resolución mensual SIPA (via ignacioonline.com.ar / siap.blogdelcontador.com.ar)';

/**
 * Topes máximos imponibles (base imponible máxima SIPA) 2026.
 * Valores en pesos enteros (redondeados del centavo).
 * Fuente: resoluciones ANSES publicadas en el Boletín Oficial.
 *
 * Para agregar meses futuros, añadir una entrada al array con el valor
 * publicado por ANSES en la resolución correspondiente.
 */
const TOPES_2026: { periodo: string; tope: number }[] = [
  { periodo: '2026-01', tope: 3823373 }, // Res. ANSES 381/2025 (BO 24-12-2025)
  { periodo: '2026-02', tope: 3932339 }, // Res. ANSES — BO 06-02-2026
  { periodo: '2026-03', tope: 4045590 }, // Res. ANSES — BO mar-2026
  { periodo: '2026-04', tope: 4162913 }, // Res. ANSES — BO abr-2026
  { periodo: '2026-05', tope: 4303619 }, // Res. ANSES 110/2026 — BO may-2026
  { periodo: '2026-06', tope: 4414652 }, // Res. ANSES 139/2026 — BO jun-2026
];

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('  SEED: Topes Máximos Imponibles 2026 (hardcoded)');
console.log('='.repeat(60));
console.log(`\n  Períodos a cargar: ${TOPES_2026.length}\n`);

let guardados = 0;
let errores = 0;

for (const { periodo, tope } of TOPES_2026) {
  try {
    await db
      .insert(payrollParametrosPeriodo)
      .values({
        periodo,
        topeMaximoImponible: String(tope),
        salarioMinimo: null,
        fuente: FUENTE,
        actualizadoPorCron: false,
      })
      .onConflictDoUpdate({
        target: payrollParametrosPeriodo.periodo,
        set: {
          topeMaximoImponible: String(tope),
          fuente: FUENTE,
          updatedAt: new Date(),
        },
      });
    console.log(`  [OK] ${periodo}  →  $${tope.toLocaleString('es-AR')}`);
    guardados++;
  } catch (err) {
    console.error(`  [ERR] ${periodo}  →  ${(err as Error).message}`);
    errores++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`  Guardados: ${guardados} | Errores: ${errores}`);
if (errores === 0) {
  console.log('  Listo. El cron del dia 20 mantiene actualizados los meses siguientes.');
  console.log('  Para meses futuros: agregar la entrada en TOPES_2026 y volver a correr.');
} else {
  console.log('  Revisar los errores arriba.');
}
console.log('='.repeat(60));

process.exit(errores > 0 ? 1 : 0);
