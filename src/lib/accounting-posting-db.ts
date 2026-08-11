/**
 * Helpers de DB compartidos por los motores de asientos automáticos
 * (comprobantes y sueldos). Server-only: toca `db` directamente, así que NO debe
 * importarse desde componentes — entrarían al bundle del cliente y arrastrarían
 * el driver de Postgres.
 *
 * Se extrajo cuando el motor de sueldos necesitó la misma lógica que el de
 * comprobantes: resolver la cuenta de pendiente de revisión, ubicar el período
 * contable de una fecha, validar que las cuentas sean imputables y numerar el
 * asiento.
 *
 * `accounting.tsx` todavía tiene su propia copia privada de varias de estas
 * funciones. Cuando ese archivo se porte, pasa a importarlas de acá: las de este
 * módulo son las mismas, con el mismo comportamiento y los mismos mensajes.
 */
import { db } from '@/lib/db';
import {
  asiento,
  cuenta,
  clienteCuenta,
  ejercicio,
  periodoContable,
  reglaMapeo,
  reglaMapeoLinea,
} from '@/drizzle/schema';
import { and, asc, eq, inArray, gte, lte, sql } from 'drizzle-orm';
import type { ReglaLike } from '@/lib/accounting-invoice-posting';
import { PENDING_REVIEW_CODE } from '@/lib/accounting-labels';

/** Cuenta de sistema «Pendiente de revisión» del estudio. Lanza si falta. */
export async function loadPendingReviewAccountId(
  orgId: string
): Promise<string> {
  const [acc] = await db
    .select({ id: cuenta.id })
    .from(cuenta)
    .where(
      and(
        eq(cuenta.orgId, orgId),
        eq(cuenta.alcance, 'base'),
        eq(cuenta.codigo, PENDING_REVIEW_CODE)
      )
    )
    .limit(1);
  if (!acc) {
    throw new Error(
      'Falta la cuenta de sistema "Pendiente de revisión". Re-sembrá el plan base'
    );
  }
  return acc.id;
}

/**
 * Reglas activas de la empresa para un módulo, ya ordenadas por prioridad
 * (asc = más específicas primero) y con sus líneas-plantilla resueltas.
 */
export async function loadActiveMappingRules(
  clientId: string,
  modulo: 'comprobante' | 'recibo' | 'movimiento_bancario'
): Promise<ReglaLike[]> {
  const rules = await db
    .select()
    .from(reglaMapeo)
    .where(
      and(
        eq(reglaMapeo.clienteId, clientId),
        eq(reglaMapeo.modulo, modulo),
        eq(reglaMapeo.activa, true)
      )
    )
    .orderBy(asc(reglaMapeo.prioridad), asc(reglaMapeo.nombre));
  if (rules.length === 0) return [];

  const lines = await db
    .select()
    .from(reglaMapeoLinea)
    .where(
      inArray(
        reglaMapeoLinea.reglaId,
        rules.map((r) => r.id)
      )
    )
    .orderBy(asc(reglaMapeoLinea.orden));
  const byRule = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byRule.get(l.reglaId) ?? [];
    arr.push(l);
    byRule.set(l.reglaId, arr);
  }

  return rules.map(
    (r): ReglaLike => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      condicion: (r.condicion ?? null) as Record<string, unknown> | null,
      prioridad: r.prioridad,
      lineas: (byRule.get(r.id) ?? []).map((l) => ({
        cuentaId: l.cuentaId,
        lado: l.lado,
        base: l.base,
        importeFijo: l.importeFijo,
        descripcion: l.descripcion,
      })),
    })
  );
}

/**
 * Ejercicio y período contable que contienen la fecha dada.
 * Lanza 'no_fy' / 'no_period' para que el llamador decida si omite o falla.
 */
export async function resolvePeriodForDate(clientId: string, dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(date.getTime())) throw new Error('Fecha inválida');
  // `ejercicio.fecha_desde/hasta` y `periodo_contable.periodo` son columnas
  // `date`: se comparan como 'YYYY-MM-DD', no como Date.
  const dia = dateStr.slice(0, 10);
  const [fy] = await db
    .select()
    .from(ejercicio)
    .where(
      and(
        eq(ejercicio.clienteId, clientId),
        lte(ejercicio.fechaDesde, dia),
        gte(ejercicio.fechaHasta, dia)
      )
    )
    .limit(1);
  if (!fy) throw new Error('no_fy');

  // El período es mensual y `periodo` guarda el primer día del mes.
  const primerDia = `${dia.slice(0, 7)}-01`;
  const [period] = await db
    .select()
    .from(periodoContable)
    .where(
      and(
        eq(periodoContable.ejercicioId, fy.id),
        eq(periodoContable.periodo, primerDia)
      )
    )
    .limit(1);
  if (!period) throw new Error('no_period');
  return { fy, period, date };
}

/**
 * Valida que todas las cuentas sean imputables, activas y del estudio/empresa
 * correctos antes de generar el asiento.
 */
export async function assertPostableAccounts(
  clientId: string,
  orgId: string,
  accountIds: string[]
) {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return;
  const accs = await db
    .select()
    .from(cuenta)
    .where(and(eq(cuenta.orgId, orgId), inArray(cuenta.id, ids)));
  const overrides = await db
    .select()
    .from(clienteCuenta)
    .where(
      and(
        eq(clienteCuenta.clienteId, clientId),
        inArray(clienteCuenta.cuentaId, ids)
      )
    );
  const ovMap = new Map(overrides.map((o) => [o.cuentaId, o]));
  const byId = new Map(accs.map((a) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a)
      throw new Error('Una de las cuentas no existe o no pertenece al estudio');
    if (a.alcance === 'propia' && a.clienteId !== clientId) {
      throw new Error('Una de las cuentas es custom de otra empresa');
    }
    if (a.tipo !== 'imputable') {
      throw new Error(
        `La cuenta ${a.codigo} es de agrupación; solo se imputan cuentas imputables`
      );
    }
    const active = ovMap.get(id)?.activa ?? a.activa;
    if (!active) {
      throw new Error(`La cuenta ${a.codigo} está inactiva para esta empresa`);
    }
  }
}

/** Código y nombre de cada cuenta, para mostrar el asiento en la UI. */
export async function loadAccountLabels(
  orgId: string,
  accountIds: string[]
): Promise<Map<string, { code: string; name: string }>> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: cuenta.id, code: cuenta.codigo, name: cuenta.nombre })
    .from(cuenta)
    .where(and(eq(cuenta.orgId, orgId), inArray(cuenta.id, ids)));
  return new Map(rows.map((r) => [r.id, { code: r.code, name: r.name }]));
}

/**
 * Siguiente número consecutivo de asiento dentro del ejercicio.
 * Debe llamarse dentro de la transacción que inserta el asiento, para que la
 * numeración no tenga saltos ni colisiones.
 */
export async function nextEntryNumber(
  tx: Pick<typeof db, 'select'>,
  clientId: string,
  fyId: string
): Promise<number> {
  const [{ maxNum }] = await tx
    .select({ maxNum: sql<number>`coalesce(max(${asiento.numero}),0)::int` })
    .from(asiento)
    .where(and(eq(asiento.clienteId, clientId), eq(asiento.ejercicioId, fyId)));
  return (maxNum ?? 0) + 1;
}
