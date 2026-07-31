/**
 * Siembra el plan de cuentas base (`alcance='base'`) en una organización.
 * Idempotente: solo inserta las cuentas base que falten (por código).
 *
 * El plan base se referencia, no se clona: las empresas lo usan vía
 * `cuenta` (alcance='base') + `cliente_cuenta`. Por eso vive a nivel de la org.
 */
import { db } from '@/lib/db';
import { cuenta } from '@/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import {
  BASE_CHART,
  parentCodeOf,
  validateBaseChart,
} from '@/lib/accounting-base-chart';

export interface SeedResult {
  inserted: number;
  skipped: number;
}

export async function seedBaseChartForOrg(orgId: string): Promise<SeedResult> {
  // UST5: validar el plan base antes de seedear para evitar inconsistencias críticas.
  const validationErrors = validateBaseChart();
  if (validationErrors.length > 0) {
    throw new Error(
      `Plan de cuentas base inválido — no se siembra:\n${validationErrors.join('\n')}`
    );
  }

  // Cuentas base ya existentes en esta organización.
  const existing = await db
    .select({ id: cuenta.id, codigo: cuenta.codigo })
    .from(cuenta)
    .where(and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base')));

  const codeToId = new Map<string, string>(
    existing.map((a) => [a.codigo, a.id])
  );
  const existingCodes = new Set(codeToId.keys());

  const toInsert = BASE_CHART.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length === 0) {
    return { inserted: 0, skipped: BASE_CHART.length };
  }

  // 1ra pasada: insertar sin padreId (los códigos vienen ordenados padre→hijo,
  // pero resolvemos el padre después para no depender del orden de retorno).
  const inserted = await db
    .insert(cuenta)
    .values(
      toInsert.map((a) => ({
        orgId,
        alcance: 'base' as const,
        clienteId: null,
        codigo: a.code,
        nombre: a.name,
        descripcion: null,
        tipo: a.type,
        padreId: null,
        rubro: (a.accountGroup ?? null) as never,
        saldoEsperado: (a.expectedBalance ?? null) as never,
        funcionGasto: (a.expenseFunction ?? null) as never,
        esCuentaSistema: a.isSystemAccount ?? false,
        activa: a.isActive ?? true,
      }))
    )
    .returning({ id: cuenta.id, codigo: cuenta.codigo });

  for (const row of inserted) codeToId.set(row.codigo, row.id);

  // 2da pasada: setear padreId resolviendo por código.
  for (const a of toInsert) {
    const parentCode = parentCodeOf(a.code);
    if (!parentCode) continue;
    const padreId = codeToId.get(parentCode);
    const selfId = codeToId.get(a.code);
    if (!padreId || !selfId) continue;
    await db.update(cuenta).set({ padreId }).where(eq(cuenta.id, selfId));
  }

  return { inserted: inserted.length, skipped: existing.length };
}
