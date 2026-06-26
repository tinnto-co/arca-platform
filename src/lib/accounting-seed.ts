/**
 * Siembra el plan de cuentas base (`scope='base'`) en una organización.
 * Idempotente: solo inserta las cuentas base que falten (por código).
 *
 * El plan base se referencia, no se clona: las empresas lo usan vía
 * `account` (scope='base') + `accountOverride`. Por eso vive a nivel `organization`.
 */
import { db } from '@/lib/db';
import { account } from '@/drizzle/schema';
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
    .select({ id: account.id, code: account.code })
    .from(account)
    .where(and(eq(account.organizationId, orgId), eq(account.scope, 'base')));

  const codeToId = new Map<string, string>(existing.map((a) => [a.code, a.id]));
  const existingCodes = new Set(codeToId.keys());

  const toInsert = BASE_CHART.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length === 0) {
    return { inserted: 0, skipped: BASE_CHART.length };
  }

  // 1ra pasada: insertar sin parentId (los códigos vienen ordenados padre→hijo,
  // pero resolvemos parentId después para no depender del orden de retorno).
  const inserted = await db
    .insert(account)
    .values(
      toInsert.map((a) => ({
        scope: 'base' as const,
        organizationId: orgId,
        clientId: null,
        code: a.code,
        name: a.name,
        description: null,
        type: a.type,
        parentId: null,
        accountGroup: (a.accountGroup ?? null) as never,
        expectedBalance: (a.expectedBalance ?? null) as never,
        expenseFunction: (a.expenseFunction ?? null) as never,
        isSystemAccount: a.isSystemAccount ?? false,
        isActive: a.isActive ?? true,
      }))
    )
    .returning({ id: account.id, code: account.code });

  for (const row of inserted) codeToId.set(row.code, row.id);

  // 2da pasada: setear parentId resolviendo por código.
  for (const a of toInsert) {
    const parentCode = parentCodeOf(a.code);
    if (!parentCode) continue;
    const parentId = codeToId.get(parentCode);
    const selfId = codeToId.get(a.code);
    if (!parentId || !selfId) continue;
    await db.update(account).set({ parentId }).where(eq(account.id, selfId));
  }

  return { inserted: inserted.length, skipped: existing.length };
}
