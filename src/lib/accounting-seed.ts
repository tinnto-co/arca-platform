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
import { defaultInflationNature } from '@/lib/accounting-inflation';

export interface SeedResult {
  inserted: number;
  skipped: number;
  /** Cuentas preexistentes a las que se les completó la naturaleza frente al AXI. */
  backfilled: number;
}

/**
 * Completa los atributos de ajuste por inflación en cuentas que se sembraron
 * antes de que existieran (`inflation_nature`, `inflation_target_id`).
 *
 * Sin esto, los planes ya sembrados quedan sin clasificar y el ajuste cae en el
 * default por rubro — que para el Capital social es incorrecto: su reexpresión
 * tiene que ir a Ajuste de capital, no a sí mismo.
 *
 * Solo toca lo que está en NULL: nunca pisa una clasificación que el contador
 * haya cambiado a mano.
 */
async function backfillInflationAttributes(orgId: string): Promise<number> {
  const rows = await db
    .select({
      id: account.id,
      code: account.code,
      accountGroup: account.accountGroup,
      inflationNature: account.inflationNature,
      inflationTargetId: account.inflationTargetId,
    })
    .from(account)
    .where(eq(account.organizationId, orgId));

  const byCode = new Map(rows.map((r) => [r.code, r]));
  const baseByCode = new Map(BASE_CHART.map((a) => [a.code, a]));
  let touched = 0;

  for (const row of rows) {
    const seed = baseByCode.get(row.code);
    const patch: {
      inflationNature?: string;
      inflationTargetId?: string | null;
    } = {};

    if (!row.inflationNature) {
      // Cuenta del plan base → lo que declara el seed; cuenta propia de una
      // empresa → el default de su rubro.
      patch.inflationNature =
        seed?.inflationNature ?? defaultInflationNature(row.accountGroup);
    }
    if (!row.inflationTargetId && seed?.inflationTargetCode) {
      const target = byCode.get(seed.inflationTargetCode);
      if (target) patch.inflationTargetId = target.id;
    }

    if (Object.keys(patch).length === 0) continue;
    await db
      .update(account)
      .set(patch as never)
      .where(eq(account.id, row.id));
    touched++;
  }
  return touched;
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
    return {
      inserted: 0,
      skipped: BASE_CHART.length,
      backfilled: await backfillInflationAttributes(orgId),
    };
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
        inflationNature: (a.inflationNature ?? null) as never,
        inflationTargetId: null,
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

  // 3ra pasada: destino del ajuste por inflación (Capital social → Ajuste de
  // capital). Va aparte porque la cuenta destino puede insertarse después.
  for (const a of toInsert) {
    if (!a.inflationTargetCode) continue;
    const selfId = codeToId.get(a.code);
    const targetId = codeToId.get(a.inflationTargetCode);
    if (!selfId || !targetId) continue;
    await db
      .update(account)
      .set({ inflationTargetId: targetId })
      .where(eq(account.id, selfId));
  }

  return {
    inserted: inserted.length,
    skipped: existing.length,
    backfilled: await backfillInflationAttributes(orgId),
  };
}
