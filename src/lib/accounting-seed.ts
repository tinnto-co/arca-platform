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
import { defaultInflationNature } from '@/lib/accounting-inflation';
import { defaultCashFlowActivity } from '@/lib/accounting-cashflow';
import { CASH_FLOW_ACTIVITY_TO_DB } from '@/lib/accounting-labels';

export interface SeedResult {
  inserted: number;
  skipped: number;
  /** Cuentas preexistentes a las que se les completó la naturaleza frente al AXI. */
  backfilled: number;
}

/** El módulo puro habla operating/investing/financing; el enum, castellano. */
const flujoDb = (
  activity: ReturnType<typeof defaultCashFlowActivity>
): 'operativa' | 'inversion' | 'financiacion' | null =>
  activity ? CASH_FLOW_ACTIVITY_TO_DB[activity] : null;

/**
 * Completa los atributos de ajuste por inflación en cuentas que se sembraron
 * antes de que existieran (`naturaleza_inflacion`, `cuenta_ajuste_id`,
 * `flujo_efectivo`).
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
      id: cuenta.id,
      codigo: cuenta.codigo,
      rubro: cuenta.rubro,
      naturalezaInflacion: cuenta.naturalezaInflacion,
      cuentaAjusteId: cuenta.cuentaAjusteId,
      flujoEfectivo: cuenta.flujoEfectivo,
    })
    .from(cuenta)
    .where(eq(cuenta.orgId, orgId));

  const byCode = new Map(rows.map((r) => [r.codigo, r]));
  const baseByCode = new Map(BASE_CHART.map((a) => [a.code, a]));
  let touched = 0;

  for (const row of rows) {
    const seed = baseByCode.get(row.codigo);
    const patch: {
      naturalezaInflacion?: string;
      cuentaAjusteId?: string | null;
      flujoEfectivo?: string | null;
    } = {};

    if (!row.naturalezaInflacion) {
      // Cuenta del plan base → lo que declara el seed; cuenta propia de una
      // empresa → el default de su rubro.
      patch.naturalezaInflacion =
        seed?.inflationNature ?? defaultInflationNature(row.rubro);
    }
    if (!row.flujoEfectivo) {
      const activity =
        seed !== undefined
          ? (seed.cashFlowActivity ?? null)
          : defaultCashFlowActivity(row.rubro);
      const db_ = flujoDb(activity);
      if (db_) patch.flujoEfectivo = db_;
    }
    if (!row.cuentaAjusteId && seed?.inflationTargetCode) {
      const target = byCode.get(seed.inflationTargetCode);
      if (target) patch.cuentaAjusteId = target.id;
    }

    if (Object.keys(patch).length === 0) continue;
    await db
      .update(cuenta)
      .set(patch as never)
      .where(eq(cuenta.id, row.id));
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
    .select({ id: cuenta.id, codigo: cuenta.codigo })
    .from(cuenta)
    .where(and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base')));

  const codeToId = new Map<string, string>(
    existing.map((a) => [a.codigo, a.id])
  );
  const existingCodes = new Set(codeToId.keys());

  const toInsert = BASE_CHART.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length === 0) {
    return {
      inserted: 0,
      skipped: BASE_CHART.length,
      backfilled: await backfillInflationAttributes(orgId),
    };
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
        naturalezaInflacion: (a.inflationNature ?? null) as never,
        flujoEfectivo: flujoDb(a.cashFlowActivity ?? null) as never,
        cuentaAjusteId: null,
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

  // 3ra pasada: destino del ajuste por inflación (Capital social → Ajuste de
  // capital). Va aparte porque la cuenta destino puede insertarse después.
  for (const a of toInsert) {
    if (!a.inflationTargetCode) continue;
    const selfId = codeToId.get(a.code);
    const targetId = codeToId.get(a.inflationTargetCode);
    if (!selfId || !targetId) continue;
    await db
      .update(cuenta)
      .set({ cuentaAjusteId: targetId })
      .where(eq(cuenta.id, selfId));
  }

  return {
    inserted: inserted.length,
    skipped: existing.length,
    backfilled: await backfillInflationAttributes(orgId),
  };
}
