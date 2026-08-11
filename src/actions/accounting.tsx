/**
 * Server functions del módulo de Balances — Fase 1: Plan de cuentas.
 *
 * Multi-tenant: el plan base vive a nivel `organization`; la personalización
 * (overrides, cuentas custom) y todo lo contable vive a nivel `cliente` (empresa fiscal).
 * Toda query arranca con getSessionWithOrg() y filtra por orgId / clientId.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cuenta,
  clienteCuenta,
  evento,
  periodoContable,
  firmante,
  cliente,
  anexoCmv,
  eecc,
  ejercicio,
  bienDeUso,
  comprobante,
  asiento,
  asientoLinea,
  reglaMapeo,
  reglaMapeoLinea,
  clienteEeccConfig,
  contraparte,
  comprobanteTipo,
  ajusteInflacion,
  ajusteInflacionLinea,
  indiceInflacion,
  plantillaInformeAuditor,
} from '@/drizzle/schema';
import { user } from '@/drizzle/auth';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  CUSTOM_CODE_PREFIX,
  CUSTOM_SEGMENT_START,
  PENDING_REVIEW_CODE,
  EXPENSE_ACCOUNT_GROUPS,
  RESULT_ACCOUNT_GROUPS,
  RESULT_TARGET_GROUP,
  MONTH_NAMES,
  ACCOUNT_GROUP_SECTIONS,
  ACCOUNT_GROUP_LABELS,
  EXPENSE_FUNCTION_LABELS,
  type AccountGroup,
  CASH_FLOW_ACTIVITY_FROM_DB,
} from '@/lib/accounting-labels';
import {
  CASH_FLOW_ACTIVITY_LABELS,
  CASH_FLOW_ACTIVITY_ORDER,
  defaultCashFlowActivity,
  isCashGroup,
  type CashFlowActivity,
} from '@/lib/accounting-cashflow';
import {
  armarLineas,
  calcularImportes,
  seleccionarRegla,
  type ReglaLike,
  type LineaArmada,
} from '@/lib/accounting-invoice-posting';
import {
  depreciationSnapshot,
  accumulatedDepreciation,
} from '@/lib/accounting-depreciation';
import { parentCodeOf } from '@/lib/accounting-base-chart';
import * as r2Storage from '@/lib/r2';
import {
  planChartImport,
  type ExistingAccount,
  type PlannedAccount,
} from '@/lib/accounting-chart-import';

/* ───────────────────────────── Helpers ───────────────────────────── */

/**
 * `periodo_contable.periodo` es una columna `date` con el día 1 del mes.
 * Drizzle la expone como string `YYYY-MM-DD`, así que año y mes se derivan
 * del texto (nunca con `new Date()`, que corre el día por zona horaria).
 */
function periodoDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
function periodoYear(periodo: string): number {
  return Number(periodo.slice(0, 4));
}
function periodoMonth(periodo: string): number {
  return Number(periodo.slice(5, 7));
}

/**
 * Bitácora. El modelo nuevo tiene una sola tabla `evento` para toda la app
 * (`entidad` + `tipo`), no una de log por módulo. El vocabulario viejo de
 * contabilidad se conserva en `detalle.accion` porque es lo que la UI filtra y
 * muestra; `entidad`/`tipo` son la forma nueva, genérica.
 */
type AccountingEventType =
  | 'account_created'
  | 'account_deactivated'
  | 'period_closed'
  | 'period_reopened'
  | 'fiscal_year_closed'
  | 'fiscal_year_reopened'
  | 'journal_entry_created'
  | 'journal_entry_edited'
  | 'journal_entry_voided'
  | 'financial_statement_approved';

const ACCOUNTING_EVENT_SHAPE: Record<
  AccountingEventType,
  { entidad: string; tipo: 'alta' | 'cambio' | 'baja' }
> = {
  account_created: { entidad: 'cuenta', tipo: 'alta' },
  account_deactivated: { entidad: 'cuenta', tipo: 'baja' },
  period_closed: { entidad: 'periodo_contable', tipo: 'cambio' },
  period_reopened: { entidad: 'periodo_contable', tipo: 'cambio' },
  fiscal_year_closed: { entidad: 'ejercicio', tipo: 'cambio' },
  fiscal_year_reopened: { entidad: 'ejercicio', tipo: 'cambio' },
  journal_entry_created: { entidad: 'asiento', tipo: 'alta' },
  journal_entry_edited: { entidad: 'asiento', tipo: 'cambio' },
  journal_entry_voided: { entidad: 'asiento', tipo: 'baja' },
  financial_statement_approved: { entidad: 'eecc', tipo: 'cambio' },
};

/** Expresión SQL del tipo de evento contable (vive dentro de `detalle`). */
const eventoAccion = sql<string>`${evento.detalle}->>'accion'`;

function accountingEvent(args: {
  orgId: string;
  clientId: string;
  eventType: AccountingEventType;
  entityId?: string | null;
  fiscalYearId?: string | null;
  data?: Record<string, unknown>;
  /** null cuando el asiento lo generó un proceso automático, no una persona. */
  userId: string | null;
}): typeof evento.$inferInsert {
  const shape = ACCOUNTING_EVENT_SHAPE[args.eventType];
  return {
    orgId: args.orgId,
    clienteId: args.clientId,
    entidad: shape.entidad,
    entidadId: args.entityId ?? null,
    tipo: shape.tipo,
    actorTipo: args.userId ? 'user' : 'job',
    actorId: args.userId,
    detalle: {
      accion: args.eventType,
      ...(args.fiscalYearId ? { ejercicioId: args.fiscalYearId } : {}),
      ...args.data,
    },
  };
}

/** Solo el Owner del estudio configura el plan de cuentas. */
function assertOwner(role: string): void {
  if (role !== 'owner') {
    throw new Error(
      'Solo el Owner del estudio puede modificar el plan de cuentas'
    );
  }
}

/** Valida que una empresa (cliente) pertenezca al estudio del usuario. */
async function ensureClientBelongsToOrg(
  clientId: string,
  orgId: string
): Promise<void> {
  const [row] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, clientId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Empresa no encontrada o no autorizada');
}

type AccountRow = typeof cuenta.$inferSelect;

/** Carga una cuenta validando que sea visible para (orgId, clientId). */
async function loadAccountForClient(
  accountId: string,
  orgId: string,
  clientId: string
): Promise<AccountRow> {
  const [row] = await db
    .select()
    .from(cuenta)
    .where(eq(cuenta.id, accountId))
    .limit(1);
  if (!row) throw new Error('Cuenta no encontrada');
  if (row.orgId !== orgId) throw new Error('Cuenta no autorizada');
  if (row.alcance === 'propia' && row.clienteId !== clientId) {
    throw new Error('Cuenta custom de otra empresa');
  }
  return row;
}

/** Carga una cuenta base validando que pertenezca al estudio. */
async function loadBaseAccount(
  accountId: string,
  orgId: string
): Promise<AccountRow> {
  const [row] = await db
    .select()
    .from(cuenta)
    .where(eq(cuenta.id, accountId))
    .limit(1);
  if (!row) throw new Error('Cuenta no encontrada');
  if (row.orgId !== orgId) throw new Error('Cuenta no autorizada');
  if (row.alcance !== 'base')
    throw new Error('La cuenta no pertenece al plan base');
  return row;
}

/** Ejercicio fiscal vigente (no cerrado) de la empresa, o null. */
async function getCurrentFiscalYearId(
  clientId: string
): Promise<string | null> {
  const [fy] = await db
    .select({ id: ejercicio.id })
    .from(ejercicio)
    .where(
      and(
        eq(ejercicio.clienteId, clientId),
        inArray(ejercicio.estado, ['abierto', 'en_cierre'])
      )
    )
    .orderBy(sql`${ejercicio.numero} desc`)
    .limit(1);
  return fy?.id ?? null;
}

/** Cuenta los movimientos (líneas de asiento no anuladas) de una cuenta en una empresa. */
async function countMovements(
  clientId: string,
  accountId: string,
  fiscalYearId: string | null
): Promise<number> {
  const conditions = [
    eq(asiento.clienteId, clientId),
    eq(asientoLinea.cuentaId, accountId),
    eq(asiento.anulado, false),
  ];
  if (fiscalYearId) conditions.push(eq(asiento.ejercicioId, fiscalYearId));

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .where(and(...conditions));
  return row?.count ?? 0;
}

/** Último segmento numérico de un código ("2.1.05.901" → 901), o -1 si no aplica. */
function lastCodeSegment(code: string): number {
  const seg = code.slice(code.lastIndexOf('.') + 1);
  const n = parseInt(seg, 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * Genera el próximo código libre para una cuenta propia bajo `parent`, dentro
 * del rango reservado (último segmento ≥ CUSTOM_SEGMENT_START). Considera los
 * hijos base del estudio y los custom de la empresa para no repetir código.
 */
async function generateCustomChildCode(
  orgId: string,
  clientId: string,
  parent: AccountRow
): Promise<string> {
  const siblings = await db
    .select({ code: cuenta.codigo })
    .from(cuenta)
    .where(
      and(
        eq(cuenta.orgId, orgId),
        eq(cuenta.padreId, parent.id),
        sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${clientId})`
      )
    );
  let max = CUSTOM_SEGMENT_START - 1;
  for (const s of siblings) {
    const seg = lastCodeSegment(s.code);
    if (seg > max) max = seg;
  }
  const next = max + 1;
  return `${parent.codigo}.${String(next).padStart(3, '0')}`;
}

/* ───────────────────────────── Queries ───────────────────────────── */

/** Rol del usuario en el estudio (owner | member | viewer) para gating de UI. */
export const getCurrentRole = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    return { role };
  }
);

/** Lista las empresas (cliente) del estudio para el selector del módulo. */
export const listAccountingClients = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();
    return db
      .select({
        id: cliente.id,
        name: cliente.razonSocial,
        identityNumber: cliente.cuit,
      })
      .from(cliente)
      .where(eq(cliente.orgId, orgId))
      .orderBy(asc(cliente.razonSocial));
  }
);

export interface ChartAccount {
  id: string;
  scope: 'base' | 'propia';
  code: string;
  /** Nombre efectivo (override.customName si existe, si no el base). */
  name: string;
  /** Nombre base original (para mostrar el override y poder revertir). */
  baseName: string;
  isRenamed: boolean;
  description: string | null;
  type: 'imputable' | 'grupo';
  parentId: string | null;
  accountGroup: string | null;
  expectedBalance: string | null;
  expenseFunction: string | null;
  isSystemAccount: boolean;
  /** Estado efectivo para esta empresa (override.isActive ?? cuenta.activa). */
  isActive: boolean;
  /** Tiene movimientos en el ejercicio actual de la empresa. */
  hasMovements: boolean;
}

/**
 * Plan de cuentas efectivo para una empresa: cuentas base del estudio (con
 * override aplicado) + cuentas custom de la empresa, más flag de movimientos
 * en el ejercicio actual.  (US 1.1.1)
 */
export const getChartOfAccounts = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    // Cuentas base del estudio + custom de la empresa.
    const accounts = await db
      .select()
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          sql`(${cuenta.alcance} = 'base' OR (${cuenta.alcance} = 'propia' AND ${cuenta.clienteId} = ${clientId}))`
        )
      )
      .orderBy(asc(cuenta.codigo));

    // Overrides de la empresa.
    const overrides = await db
      .select()
      .from(clienteCuenta)
      .where(eq(clienteCuenta.clienteId, clientId));
    const overrideByAccount = new Map(overrides.map((o) => [o.cuentaId, o]));

    // Cuentas con movimientos en el ejercicio actual.
    const currentFyId = await getCurrentFiscalYearId(clientId);
    const movementAccountIds = new Set<string>();
    if (currentFyId) {
      const rows = await db
        .selectDistinct({ accountId: asientoLinea.cuentaId })
        .from(asientoLinea)
        .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
        .where(
          and(
            eq(asiento.clienteId, clientId),
            eq(asiento.ejercicioId, currentFyId),
            eq(asiento.anulado, false)
          )
        );
      for (const r of rows) movementAccountIds.add(r.accountId);
    }

    const result: ChartAccount[] = accounts.map((a) => {
      const ov = overrideByAccount.get(a.id);
      const isRenamed = a.alcance === 'base' && !!ov?.nombrePropio;
      return {
        id: a.id,
        scope: a.alcance,
        code: a.codigo,
        name: isRenamed ? ov.nombrePropio! : a.nombre,
        baseName: a.nombre,
        isRenamed,
        description: a.descripcion,
        type: a.tipo,
        parentId: a.padreId,
        accountGroup: a.rubro,
        expectedBalance: a.saldoEsperado,
        expenseFunction: a.funcionGasto,
        isSystemAccount: a.esCuentaSistema,
        isActive: a.alcance === 'base' ? (ov?.activa ?? a.activa) : a.activa,
        hasMovements: movementAccountIds.has(a.id),
      };
    });

    return { accounts: result, hasCurrentFiscalYear: currentFyId !== null };
  });

/**
 * Conteo de movimientos de una cuenta en la empresa (para el diálogo de confirmación
 * previo a desactivar).  (US 1.1.2)
 */
export const getAccountMovementCounts = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), accountId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId, accountId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    await loadAccountForClient(accountId, orgId, clientId);

    const currentFyId = await getCurrentFiscalYearId(clientId);
    const total = await countMovements(clientId, accountId, null);
    const currentYear = currentFyId
      ? await countMovements(clientId, accountId, currentFyId)
      : 0;
    return { total, currentYear, past: total - currentYear };
  });

/* ──────────────────────────── Mutations ──────────────────────────── */

/**
 * Activa o desactiva una cuenta para una empresa puntual.  (US 1.1.2)
 * - Cuentas base → se persiste como clienteCuenta (no toca a otras empresas).
 * - Cuentas custom → se actualiza la cuenta directamente.
 * - isSystemAccount no se puede desactivar.
 * - No se puede desactivar una cuenta con movimientos en el ejercicio actual.
 */
export const setAccountActive = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      accountId: z.string().uuid(),
      isActive: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { clientId, accountId, isActive } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const acc = await loadAccountForClient(accountId, orgId, clientId);

    if (!isActive) {
      if (acc.esCuentaSistema) {
        throw new Error('Las cuentas de sistema no se pueden desactivar');
      }
      const currentFyId = await getCurrentFiscalYearId(clientId);
      const currentCount = currentFyId
        ? await countMovements(clientId, accountId, currentFyId)
        : 0;
      if (currentCount > 0) {
        throw new Error(
          'No se puede desactivar: la cuenta tiene movimientos en el ejercicio actual'
        );
      }
    }

    if (acc.alcance === 'propia') {
      await db
        .update(cuenta)
        .set({ activa: isActive })
        .where(eq(cuenta.id, accountId));
    } else {
      await db
        .insert(clienteCuenta)
        .values({ clienteId: clientId, cuentaId: accountId, activa: isActive })
        .onConflictDoUpdate({
          target: [clienteCuenta.clienteId, clienteCuenta.cuentaId],
          set: { activa: isActive },
        });
    }

    if (!isActive) {
      await db.insert(evento).values(
        accountingEvent({
          orgId,
          clientId,
          eventType: 'account_deactivated',
          entityId: accountId,
          data: { accountId, code: acc.codigo, scope: acc.alcance },
          userId,
        })
      );
    }

    return { ok: true };
  });

/**
 * Crea una cuenta custom propia de la empresa.  (US 1.1.3)
 * - Se cuelga de un agrupador (cuenta padre) del plan visible para la empresa.
 * - El código se autogenera dentro del rubro del padre, en el rango reservado
 *   para cuentas propias (`.900+`), así queda ordenada junto a sus hermanas sin
 *   colisionar con cuentas base.
 */
export const createCustomAccount = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      name: z.string().min(1),
      type: z.enum(['imputable', 'grupo']),
      accountGroup: z.string().optional(),
      expectedBalance: z.enum(['deudor', 'acreedor', 'ambos']).optional(),
      expenseFunction: z
        .enum(['administracion', 'comercializacion', 'financiero', 'otro'])
        .optional(),
      description: z.string().optional(),
      parentId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);

    if (d.type === 'imputable' && (!d.accountGroup || !d.expectedBalance)) {
      throw new Error(
        'Las cuentas imputables requieren rubro de exposición y saldo esperado'
      );
    }

    // La cuenta propia se cuelga de un agrupador del plan visible para la empresa.
    const parent = await loadAccountForClient(d.parentId, orgId, d.clientId);
    if (parent.tipo !== 'grupo') {
      throw new Error('La cuenta padre debe ser una agrupación');
    }

    // Código autogenerado en el rango reservado, ordenado junto a sus hermanas.
    const code = await generateCustomChildCode(orgId, d.clientId, parent);

    // Chequeo de colisión defensivo (por si dos altas simultáneas).
    const [collision] = await db
      .select({ id: cuenta.id })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.codigo, code),
          sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${d.clientId})`
        )
      )
      .limit(1);
    if (collision) {
      throw new Error('No se pudo asignar un código libre. Reintentá');
    }

    const [created] = await db
      .insert(cuenta)
      .values({
        alcance: 'propia',
        orgId,
        clienteId: d.clientId,
        codigo: code,
        nombre: d.name.trim(),
        descripcion: d.description?.trim() ? d.description.trim() : null,
        tipo: d.type,
        padreId: parent.id,
        rubro: (d.accountGroup ?? null) as never,
        saldoEsperado: (d.expectedBalance ?? null) as never,
        funcionGasto: (d.expenseFunction ?? null) as never,
        esCuentaSistema: false,
        activa: true,
      })
      .returning();

    await db.insert(evento).values(
      accountingEvent({
        orgId,
        clientId: d.clientId,
        eventType: 'account_created',
        entityId: created.id,
        data: { accountId: created.id, code, scope: 'propia' },
        userId,
      })
    );

    return created;
  });

/**
 * Renombra una cuenta del plan base solo para una empresa (override).  (US 1.1.4)
 */
export const renameBaseAccount = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      accountId: z.string().uuid(),
      customName: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { clientId, accountId, customName } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const acc = await loadBaseAccount(accountId, orgId);
    if (acc.esCuentaSistema) {
      throw new Error('Las cuentas de sistema no se pueden renombrar');
    }

    await db
      .insert(clienteCuenta)
      .values({
        clienteId: clientId,
        cuentaId: accountId,
        nombrePropio: customName.trim(),
      })
      .onConflictDoUpdate({
        target: [clienteCuenta.clienteId, clienteCuenta.cuentaId],
        set: { nombrePropio: customName.trim() },
      });

    return { ok: true };
  });

/**
 * Revierte el renombre de una cuenta base, volviendo al nombre del estudio.  (US 1.1.4)
 * Si el override solo servía para el renombre, se elimina la fila.
 */
export const revertBaseAccountRename = createServerFn({ method: 'POST' })
  .validator(
    z.object({ clientId: z.string().uuid(), accountId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { clientId, accountId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const [ov] = await db
      .select()
      .from(clienteCuenta)
      .where(
        and(
          eq(clienteCuenta.clienteId, clientId),
          eq(clienteCuenta.cuentaId, accountId)
        )
      )
      .limit(1);
    if (!ov) return { ok: true };

    if (ov.activa === null) {
      // El override solo guardaba el renombre → se elimina.
      await db.delete(clienteCuenta).where(eq(clienteCuenta.id, ov.id));
    } else {
      await db
        .update(clienteCuenta)
        .set({ nombrePropio: null })
        .where(eq(clienteCuenta.id, ov.id));
    }
    return { ok: true };
  });

/* ─────────────────── Plan base del estudio (US 1.1.5) ─────────────────── */

/**
 * Agrega una cuenta al plan base del estudio. Aparece INACTIVA por default en
 * todas las empresas (se propaga por referencia, no por clonado).
 */
export const createBaseAccount = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(['imputable', 'grupo']),
      accountGroup: z.string().optional(),
      expectedBalance: z.enum(['deudor', 'acreedor', 'ambos']).optional(),
      expenseFunction: z
        .enum(['administracion', 'comercializacion', 'financiero', 'otro'])
        .optional(),
      description: z.string().optional(),
      parentId: z.string().uuid().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const d = ctx.data;
    const code = d.code.trim();
    if (!/^[0-9]+(\.[0-9]+)*$/.test(code)) {
      throw new Error(
        'El código solo admite números separados por puntos (ej. "1.1.07")'
      );
    }
    if (code.startsWith(CUSTOM_CODE_PREFIX)) {
      throw new Error(
        'El rango "9.x" está reservado para cuentas propias de cada empresa'
      );
    }
    if (lastCodeSegment(code) >= CUSTOM_SEGMENT_START) {
      throw new Error(
        'El rango ".900" en adelante está reservado para cuentas propias de cada empresa'
      );
    }
    if (d.type === 'imputable' && (!d.accountGroup || !d.expectedBalance)) {
      throw new Error(
        'Las cuentas imputables requieren rubro de exposición y saldo esperado'
      );
    }

    const [collision] = await db
      .select({ id: cuenta.id })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.alcance, 'base'),
          eq(cuenta.codigo, code)
        )
      )
      .limit(1);
    if (collision) throw new Error('Ese código ya existe en el plan base');

    // Si se cuelga de un padre: debe ser agrupación y el código tiene que
    // empezar con el del padre (evita jerarquías código↔padre inconsistentes).
    if (d.parentId) {
      const parent = await loadBaseAccount(d.parentId, orgId);
      if (parent.tipo !== 'grupo') {
        throw new Error('La cuenta padre debe ser una agrupación');
      }
      if (!code.startsWith(`${parent.codigo}.`)) {
        throw new Error(
          `El código debe empezar con el de la cuenta padre ("${parent.codigo}.")`
        );
      }
    }

    const [created] = await db
      .insert(cuenta)
      .values({
        alcance: 'base',
        orgId,
        clienteId: null,
        codigo: code,
        nombre: d.name.trim(),
        descripcion: d.description?.trim() ? d.description.trim() : null,
        tipo: d.type,
        padreId: d.parentId ?? null,
        rubro: (d.accountGroup ?? null) as never,
        saldoEsperado: (d.expectedBalance ?? null) as never,
        funcionGasto: (d.expenseFunction ?? null) as never,
        esCuentaSistema: false,
        // Nueva cuenta base: inactiva por default en todas las empresas.
        activa: false,
      })
      .returning();

    return created;
  });

/**
 * Edita una cuenta del plan base. Solo permitido si no tiene movimientos en
 * NINGUNA empresa (cambiar rubro/tipo post-movimientos corrompería los EECC).
 */
export const updateBaseAccount = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      type: z.enum(['imputable', 'grupo']).optional(),
      accountGroup: z.string().optional(),
      expectedBalance: z.enum(['deudor', 'acreedor', 'ambos']).optional(),
      expenseFunction: z
        .enum(['administracion', 'comercializacion', 'financiero', 'otro'])
        .nullable()
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const acc = await loadBaseAccount(ctx.data.id, orgId);
    if (acc.esCuentaSistema) {
      throw new Error('Las cuentas de sistema no se pueden editar');
    }

    // Movimientos en cualquier empresa.
    const [mov] = await db
      .select({ id: asientoLinea.id })
      .from(asientoLinea)
      .where(eq(asientoLinea.cuentaId, acc.id))
      .limit(1);
    if (mov) {
      throw new Error(
        'No se puede editar: la cuenta tiene movimientos en alguna empresa'
      );
    }

    const updates: Partial<typeof cuenta.$inferInsert> = {};
    if (ctx.data.name !== undefined) updates.nombre = ctx.data.name.trim();
    if (ctx.data.description !== undefined)
      updates.descripcion = ctx.data.description;
    if (ctx.data.type !== undefined) updates.tipo = ctx.data.type;
    if (ctx.data.accountGroup !== undefined)
      updates.rubro = ctx.data.accountGroup as never;
    if (ctx.data.expectedBalance !== undefined)
      updates.saldoEsperado = ctx.data.expectedBalance;
    if (ctx.data.expenseFunction !== undefined) {
      updates.funcionGasto = ctx.data.expenseFunction;
    }

    const [updated] = await db
      .update(cuenta)
      .set(updates)
      .where(eq(cuenta.id, acc.id))
      .returning();
    return updated;
  });

/**
 * Borra una cuenta del plan base. No permitido si tiene movimientos en alguna
 * empresa o si tiene cuentas hijas.
 */
export const deleteBaseAccount = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const acc = await loadBaseAccount(ctx.data.id, orgId);
    if (acc.esCuentaSistema) {
      throw new Error('Las cuentas de sistema no se pueden borrar');
    }

    const [mov] = await db
      .select({ id: asientoLinea.id })
      .from(asientoLinea)
      .where(eq(asientoLinea.cuentaId, acc.id))
      .limit(1);
    if (mov) {
      throw new Error(
        'No se puede borrar: la cuenta tiene movimientos en alguna empresa'
      );
    }

    const [child] = await db
      .select({ id: cuenta.id })
      .from(cuenta)
      .where(eq(cuenta.padreId, acc.id))
      .limit(1);
    if (child) {
      throw new Error(
        'No se puede borrar: la cuenta tiene subcuentas. Borrá o reasigná las hijas primero'
      );
    }

    await db.delete(cuenta).where(eq(cuenta.id, acc.id));
    return { ok: true };
  });

/**
 * Borra una cuenta custom propia de la empresa.  (US 1.1.3)
 * No permitido si tiene movimientos en la empresa o si tiene subcuentas.
 */
export const deleteCustomAccount = createServerFn({ method: 'POST' })
  .validator(z.object({ clientId: z.string().uuid(), id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { clientId, id } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const acc = await loadAccountForClient(id, orgId, clientId);
    if (acc.alcance !== 'propia') {
      throw new Error('La cuenta no es una cuenta propia de la empresa');
    }

    const currentCount = await countMovements(clientId, id, null);
    if (currentCount > 0) {
      throw new Error(
        'No se puede borrar: la cuenta tiene movimientos en esta empresa'
      );
    }

    const [child] = await db
      .select({ id: cuenta.id })
      .from(cuenta)
      .where(eq(cuenta.padreId, id))
      .limit(1);
    if (child) {
      throw new Error(
        'No se puede borrar: la cuenta tiene subcuentas. Borrá o reasigná las hijas primero'
      );
    }

    await db.delete(cuenta).where(eq(cuenta.id, id));
    return { ok: true };
  });

/* ═══════════════ IMPORTAR PLAN DE CUENTAS DESDE EXCEL ═══════════════ */

/** ¿Es una cuenta de sistema por su código? (clase "0" y sus hijas) */
function isSystemCode(code: string): boolean {
  return code === '0' || code.startsWith('0.');
}

/**
 * Devuelve el motivo por el que el plan "ya se usó" (bloquea el reemplazo), o
 * null si está limpio. base: sin movimientos, sin cuentas propias, sin
 * overrides en toda la organización. custom: sin movimientos en la empresa.
 */
async function chartUsageBlocker(
  orgId: string,
  clientId: string,
  target: 'base' | 'propia'
): Promise<string | null> {
  if (target === 'base') {
    const [mov] = await db
      .select({ id: asientoLinea.id })
      .from(asientoLinea)
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base')))
      .limit(1);
    if (mov) return 'ya hay asientos registrados sobre el plan base';

    const [custom] = await db
      .select({ id: cuenta.id })
      .from(cuenta)
      .where(and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'propia')))
      .limit(1);
    if (custom) return 'existen cuentas propias de empresas colgadas del plan';

    const [ov] = await db
      .select({ id: clienteCuenta.id })
      .from(clienteCuenta)
      .innerJoin(cuenta, eq(cuenta.id, clienteCuenta.cuentaId))
      .where(and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base')))
      .limit(1);
    if (ov) return 'hay cuentas base activadas o renombradas en alguna empresa';
    return null;
  }

  // custom
  const [mov] = await db
    .select({ id: asientoLinea.id })
    .from(asientoLinea)
    .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
    .where(and(eq(cuenta.clienteId, clientId), eq(cuenta.alcance, 'propia')))
    .limit(1);
  if (mov) return 'ya hay asientos sobre cuentas propias de esta empresa';
  return null;
}

type AccountWithId = ExistingAccount & { id: string };

const VALID_GROUPS = new Set(Object.keys(ACCOUNT_GROUP_LABELS));

/**
 * Importa un plan de cuentas desde Excel (filas ya parseadas en el cliente).
 * `confirm=false` devuelve solo el preview (diff) sin escribir; `confirm=true`
 * aplica. Import parcial tolerante: las filas con error se reportan y no frenan
 * al resto. Ver `planChartImport` para las reglas.
 */
export const importChartOfAccounts = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      target: z.enum(['base', 'propia']),
      mode: z.enum(['complementar', 'reemplazar']),
      confirm: z.boolean(),
      /** Códigos de filas modificadas a aplicar (el resto se ignora). */
      applyUpdateCodes: z.array(z.string()).default([]),
      rows: z.array(
        z.object({
          row: z.number(),
          code: z.string(),
          name: z.string(),
          type: z.enum(['grupo', 'imputable']),
          accountGroup: z.string().nullish(),
          expectedBalance: z.enum(['deudor', 'acreedor', 'ambos']).nullish(),
          expenseFunction: z
            .enum(['administracion', 'comercializacion', 'financiero', 'otro'])
            .nullish(),
          description: z.string().nullish(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId, target, mode, confirm, applyUpdateCodes, rows } =
      ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const cols = {
      id: cuenta.id,
      code: cuenta.codigo,
      name: cuenta.nombre,
      type: cuenta.tipo,
      accountGroup: cuenta.rubro,
      expectedBalance: cuenta.saldoEsperado,
      expenseFunction: cuenta.funcionGasto,
      description: cuenta.descripcion,
    };
    const baseAccounts = (await db
      .select(cols)
      .from(cuenta)
      .where(
        and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base'))
      )) as AccountWithId[];
    const customAccounts =
      target === 'propia'
        ? ((await db
            .select(cols)
            .from(cuenta)
            .where(
              and(eq(cuenta.clienteId, clientId), eq(cuenta.alcance, 'propia'))
            )) as AccountWithId[])
        : [];

    const strip = (a: AccountWithId): ExistingAccount => ({
      code: a.code,
      name: a.name,
      type: a.type,
      accountGroup: a.accountGroup,
      expectedBalance: a.expectedBalance,
      expenseFunction: a.expenseFunction,
      description: a.description,
    });

    const scopeAccounts = target === 'base' ? baseAccounts : customAccounts;
    const codeToId = new Map(
      [...baseAccounts, ...customAccounts].map((a) => [a.code, a.id])
    );

    const diff = planChartImport({
      rows,
      target,
      validGroups: VALID_GROUPS,
      // En reemplazar los padres deben venir en el archivo (se vacía el scope).
      existingForParents:
        mode === 'reemplazar'
          ? []
          : (target === 'base'
              ? baseAccounts
              : [...baseAccounts, ...customAccounts]
            ).map(strip),
      destination: mode === 'reemplazar' ? [] : scopeAccounts.map(strip),
    });

    // Preview: no escribe.
    const blocker =
      mode === 'reemplazar'
        ? await chartUsageBlocker(orgId, clientId, target)
        : null;

    if (!confirm) {
      return {
        preview: true as const,
        blocker,
        create: diff.create,
        unchanged: diff.unchanged,
        modified: diff.modified,
        errors: diff.errors,
        applied: null,
      };
    }

    if (blocker) {
      throw new Error(
        `No se puede reemplazar: ${blocker}. Usá el modo "Complementar".`
      );
    }

    // ── Aplicar ──
    // 1) Reemplazar: vaciar el scope (preservando cuentas de sistema en base).
    if (mode === 'reemplazar') {
      if (target === 'base') {
        await db
          .delete(cuenta)
          .where(
            and(
              eq(cuenta.orgId, orgId),
              eq(cuenta.alcance, 'base'),
              eq(cuenta.esCuentaSistema, false),
              sql`${cuenta.codigo} <> '0' AND ${cuenta.codigo} NOT LIKE '0.%'`
            )
          );
      } else {
        await db
          .delete(cuenta)
          .where(
            and(eq(cuenta.clienteId, clientId), eq(cuenta.alcance, 'propia'))
          );
      }
    }

    // 2) Insertar las cuentas nuevas (1ra pasada, sin parentId).
    let created = 0;
    if (diff.create.length > 0) {
      const values = diff.create.map((a: PlannedAccount) => ({
        alcance: target,
        orgId,
        clienteId: target === 'propia' ? clientId : null,
        codigo: a.code,
        nombre: a.name,
        descripcion: a.description,
        tipo: a.type,
        padreId: null,
        rubro: (a.accountGroup ?? null) as never,
        saldoEsperado: (a.expectedBalance ?? null) as never,
        funcionGasto: (a.expenseFunction ?? null) as never,
        esCuentaSistema: false,
        activa: target === 'propia',
      }));
      const ins = await db
        .insert(cuenta)
        .values(values)
        .returning({ id: cuenta.id, code: cuenta.codigo });
      for (const r of ins) codeToId.set(r.code, r.id);
      created = ins.length;
    }

    // 3) Aplicar modificaciones tildadas (solo si no tienen movimientos).
    let updated = 0;
    const updateErrors: { row: number; code: string; message: string }[] = [];
    const applySet = new Set(applyUpdateCodes);
    for (const m of diff.modified) {
      if (!applySet.has(m.code)) continue;
      const accId = codeToId.get(m.code);
      if (!accId) continue;
      const [mov] = await db
        .select({ id: asientoLinea.id })
        .from(asientoLinea)
        .where(eq(asientoLinea.cuentaId, accId))
        .limit(1);
      if (mov) {
        updateErrors.push({
          row: m.row,
          code: m.code,
          message: 'No se actualizó: la cuenta tiene movimientos',
        });
        continue;
      }
      await db
        .update(cuenta)
        .set({
          nombre: m.planned.name,
          descripcion: m.planned.description,
          tipo: m.planned.type,
          rubro: (m.planned.accountGroup ?? null) as never,
          saldoEsperado: m.planned.expectedBalance ?? null,
          funcionGasto: m.planned.expenseFunction ?? null,
        })
        .where(eq(cuenta.id, accId));
      updated++;
    }

    // 4) 2da pasada: resolver parentId por código.
    const universe = (await db
      .select({ id: cuenta.id, code: cuenta.codigo })
      .from(cuenta)
      .where(
        target === 'base'
          ? and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base'))
          : or(
              and(eq(cuenta.orgId, orgId), eq(cuenta.alcance, 'base')),
              and(eq(cuenta.clienteId, clientId), eq(cuenta.alcance, 'propia'))
            )
      )) as { id: string; code: string }[];
    const uCodeToId = new Map(universe.map((a) => [a.code, a.id]));
    const createdCodes = new Set(diff.create.map((a) => a.code));
    for (const a of universe) {
      // Relink de las creadas; en reemplazar, también las de sistema
      // preservadas (su padre pudo haber sido borrado y recreado).
      const needsRelink =
        createdCodes.has(a.code) ||
        (mode === 'reemplazar' && target === 'base' && isSystemCode(a.code));
      if (!needsRelink) continue;
      const pc = parentCodeOf(a.code);
      const parentId = pc ? (uCodeToId.get(pc) ?? null) : null;
      await db
        .update(cuenta)
        .set({ padreId: parentId })
        .where(eq(cuenta.id, a.id));
    }

    return {
      preview: false as const,
      blocker: null,
      create: diff.create,
      unchanged: diff.unchanged,
      modified: diff.modified,
      errors: [...diff.errors, ...updateErrors],
      applied: { created, updated },
    };
  });

/* ═══════════════ EJERCICIOS Y PERÍODOS (US 1.2.x) ═══════════════ */

type FiscalYearRow = typeof ejercicio.$inferSelect;
type PeriodRow = typeof periodoContable.$inferSelect;

/** Valida que un ejercicio pertenezca al estudio del usuario y lo devuelve. */
async function loadFiscalYearForOrg(
  fiscalYearId: string,
  orgId: string
): Promise<FiscalYearRow> {
  const [row] = await db
    .select({ fy: ejercicio })
    .from(ejercicio)
    .where(and(eq(ejercicio.id, fiscalYearId), eq(ejercicio.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Ejercicio no encontrado o no autorizado');
  return row.fy;
}

/** Valida que un período pertenezca al estudio y devuelve {period, fy}. */
async function loadPeriodForOrg(
  periodId: string,
  orgId: string
): Promise<{ period: PeriodRow; fy: FiscalYearRow }> {
  const [row] = await db
    .select({ period: periodoContable, fy: ejercicio })
    .from(periodoContable)
    .innerJoin(ejercicio, eq(ejercicio.id, periodoContable.ejercicioId))
    .innerJoin(cliente, eq(cliente.id, periodoContable.clienteId))
    .where(and(eq(periodoContable.id, periodId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Período no encontrado o no autorizado');
  return row;
}

/** Cantidad de asientos no anulados de un período con líneas en la cuenta pendiente de revisión. */
async function countPendingReviewEntries(
  periodId: string,
  orgId: string
): Promise<number> {
  const [r] = await db
    .select({ count: sql<number>`count(distinct ${asiento.id})::int` })
    .from(asiento)
    .innerJoin(asientoLinea, eq(asientoLinea.asientoId, asiento.id))
    .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
    .where(
      and(
        eq(asiento.periodoId, periodId),
        eq(asiento.anulado, false),
        eq(cuenta.orgId, orgId),
        eq(cuenta.codigo, PENDING_REVIEW_CODE)
      )
    );
  return r?.count ?? 0;
}

/**
 * Crea un ejercicio fiscal de exactamente 12 meses calendario y sus 12 períodos
 * mensuales (todos abiertos). Solo puede haber un ejercicio abierto por empresa. (US 1.2.1)
 */
export const createFiscalYear = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    // `fecha_desde`/`fecha_hasta` son columnas `date`: se guardan y comparan
    // como texto YYYY-MM-DD, sin pasar por Date (que arrastra zona horaria).
    const start = ctx.data.startDate;
    const end = ctx.data.endDate;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(start) || !dateRe.test(end)) {
      throw new Error('Fechas inválidas');
    }
    const sY = Number(start.slice(0, 4));
    const sM = Number(start.slice(5, 7)) - 1;
    if (start.slice(8) !== '01') {
      throw new Error('El ejercicio debe empezar el día 1 de un mes');
    }
    // El fin debe ser el último día de algún mes calendario.
    const eY = Number(end.slice(0, 4));
    const eM = Number(end.slice(5, 7)) - 1;
    const lastDayOfEndMonth = new Date(Date.UTC(eY, eM + 1, 0))
      .toISOString()
      .slice(0, 10);
    if (end !== lastDayOfEndMonth) {
      throw new Error('El ejercicio debe terminar el último día de un mes');
    }
    // Cantidad de meses calendario que abarca el ejercicio (permite
    // ejercicios irregulares: 3, 5, 6, 8, 10, etc., pero nunca más de 12).
    const months = (eY - sY) * 12 + (eM - sM) + 1;
    if (months < 1 || months > 12) {
      throw new Error('El ejercicio debe durar entre 1 y 12 meses calendario');
    }

    // Un solo ejercicio abierto por empresa.
    const [openFy] = await db
      .select({ id: ejercicio.id })
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          inArray(ejercicio.estado, ['abierto', 'en_cierre'])
        )
      )
      .limit(1);
    if (openFy) {
      throw new Error(
        'Ya hay un ejercicio abierto para esta empresa. Cerralo antes de crear uno nuevo'
      );
    }

    const [{ maxNum }] = await db
      .select({
        maxNum: sql<number>`coalesce(max(${ejercicio.numero}),0)::int`,
      })
      .from(ejercicio)
      .where(eq(ejercicio.clienteId, clientId));
    const number = (maxNum ?? 0) + 1;

    const [fy] = await db
      .insert(ejercicio)
      .values({
        orgId,
        clienteId: clientId,
        fechaDesde: start,
        fechaHasta: end,
        estado: 'abierto',
        numero: number,
      })
      .returning();

    const periods = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(sY, sM + i, 1));
      return {
        ejercicioId: fy.id,
        clienteId: clientId,
        periodo: periodoDate(d.getUTCFullYear(), d.getUTCMonth() + 1),
        estado: 'abierto' as const,
      };
    });
    await db.insert(periodoContable).values(periods);

    return fy;
  });

/** Lista los ejercicios de una empresa con su resumen de períodos cerrados. */
export const getFiscalYears = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const years = await db
      .select()
      .from(ejercicio)
      .where(eq(ejercicio.clienteId, ctx.data.clientId))
      .orderBy(desc(ejercicio.numero));

    const counts = await db
      .select({
        fiscalYearId: periodoContable.ejercicioId,
        total: sql<number>`count(*)::int`,
        closed: sql<number>`(count(*) filter (where ${periodoContable.estado} = 'cerrado'))::int`,
      })
      .from(periodoContable)
      .where(eq(periodoContable.clienteId, ctx.data.clientId))
      .groupBy(periodoContable.ejercicioId);
    const byFy = new Map(counts.map((c) => [c.fiscalYearId, c]));

    return years.map((y) => ({
      ...y,
      periodsTotal: byFy.get(y.id)?.total ?? 0,
      periodsClosed: byFy.get(y.id)?.closed ?? 0,
    }));
  });

export interface PeriodView {
  id: string;
  year: number;
  month: number;
  status: 'abierto' | 'cerrado';
  closedAt: string | Date | null;
  entryCount: number;
  totalAmount: number;
  /** Asientos no anulados con líneas en pendiente de revisión (bloquean el cierre). */
  pendingCount: number;
  isCurrent: boolean;
}

/**
 * Detalle de un ejercicio: sus 12 períodos con estado, cantidad de asientos,
 * monto movido, y cuál es el período abierto actual. (US 1.2.2)
 */
export const getFiscalYearDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ fiscalYearId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const periods = await db
      .select()
      .from(periodoContable)
      .where(eq(periodoContable.ejercicioId, fy.id))
      .orderBy(asc(periodoContable.periodo));

    const stats = await db
      .select({
        periodId: asiento.periodoId,
        entryCount: sql<number>`count(distinct ${asiento.id})::int`,
        totalDebit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      })
      .from(asiento)
      .leftJoin(asientoLinea, eq(asientoLinea.asientoId, asiento.id))
      .where(and(eq(asiento.ejercicioId, fy.id), eq(asiento.anulado, false)))
      .groupBy(asiento.periodoId);
    const byPeriod = new Map(stats.map((s) => [s.periodId, s]));

    // Asientos pendientes de revisión por período (bloquean el cierre).
    const pendingStats = await db
      .select({
        periodId: asiento.periodoId,
        pendingCount: sql<number>`count(distinct ${asiento.id})::int`,
      })
      .from(asiento)
      .innerJoin(asientoLinea, eq(asientoLinea.asientoId, asiento.id))
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(
        and(
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          eq(cuenta.orgId, orgId),
          eq(cuenta.codigo, PENDING_REVIEW_CODE)
        )
      )
      .groupBy(asiento.periodoId);
    const pendingByPeriod = new Map(
      pendingStats.map((s) => [s.periodId, s.pendingCount])
    );

    // Período actual = el abierto más antiguo.
    const currentPeriod = periods.find((p) => p.estado === 'abierto');

    const periodsOut: PeriodView[] = periods.map((p) => ({
      id: p.id,
      year: periodoYear(p.periodo),
      month: periodoMonth(p.periodo),
      status: p.estado,
      closedAt: p.cerradoAt,
      entryCount: byPeriod.get(p.id)?.entryCount ?? 0,
      totalAmount: parseFloat(byPeriod.get(p.id)?.totalDebit ?? '0'),
      pendingCount: pendingByPeriod.get(p.id) ?? 0,
      isCurrent: currentPeriod?.id === p.id,
    }));

    return {
      ejercicio: fy,
      periods: periodsOut,
      currentPeriodId: currentPeriod?.id ?? null,
    };
  });

export interface PendingReviewEntry {
  id: string;
  number: number;
  entryDate: string | Date;
  origin: string;
  sourceType: string | null;
  /** Total del asiento (suma del Debe). */
  total: number;
  /** Importe imputado a la cuenta pendiente de revisión. */
  pendingAmount: number;
  /** Motivos: descripciones de las líneas en pendiente de revisión. */
  motivos: string[];
  periodId: string;
  periodYear: number;
  periodMonth: number;
  periodStatus: 'abierto' | 'cerrado';
}

/**
 * Bandeja de asientos en pendiente de revisión: asientos no anulados con al menos
 * una línea en la cuenta de sistema pending_review, a resolver antes de cerrar. (US 3.4.1)
 */
export const getPendingReviewEntries = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx): Promise<PendingReviewEntry[]> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const prId = await loadPendingReviewAccountId(orgId);

    // Líneas en pendiente de revisión + datos de su asiento y período.
    const prLines = await db
      .select({
        entryId: asiento.id,
        number: asiento.numero,
        entryDate: asiento.fecha,
        origin: asiento.origenTipo,
        sourceType: asiento.origenTipo,
        periodId: asiento.periodoId,
        periodo: periodoContable.periodo,
        periodStatus: periodoContable.estado,
        debit: asientoLinea.debe,
        credit: asientoLinea.haber,
        description: asientoLinea.descripcion,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .innerJoin(periodoContable, eq(periodoContable.id, asiento.periodoId))
      .where(
        and(
          eq(asiento.clienteId, clientId),
          eq(asiento.anulado, false),
          eq(asientoLinea.cuentaId, prId)
        )
      )
      .orderBy(desc(asiento.fecha), desc(asiento.numero));

    if (prLines.length === 0) return [];

    // Total del asiento (suma del Debe de TODAS sus líneas).
    const entryIds = [...new Set(prLines.map((l) => l.entryId))];
    const totals = await db
      .select({
        entryId: asientoLinea.asientoId,
        total: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      })
      .from(asientoLinea)
      .where(inArray(asientoLinea.asientoId, entryIds))
      .groupBy(asientoLinea.asientoId);
    const totalByEntry = new Map(totals.map((t) => [t.entryId, t.total]));

    // Agrupar las líneas PR por asiento.
    const byEntry = new Map<string, PendingReviewEntry>();
    for (const l of prLines) {
      let e = byEntry.get(l.entryId);
      if (!e) {
        e = {
          id: l.entryId,
          number: l.number,
          entryDate: l.entryDate,
          origin: l.origin,
          sourceType: l.sourceType,
          total: parseFloat(totalByEntry.get(l.entryId) ?? '0'),
          pendingAmount: 0,
          motivos: [],
          periodId: l.periodId,
          periodYear: periodoYear(l.periodo),
          periodMonth: periodoMonth(l.periodo),
          periodStatus: l.periodStatus,
        };
        byEntry.set(l.entryId, e);
      }
      e.pendingAmount += parseFloat(l.debit) + parseFloat(l.credit);
      const motivo = l.description?.trim();
      if (motivo && !e.motivos.includes(motivo)) e.motivos.push(motivo);
    }

    return [...byEntry.values()];
  });

/**
 * Cierra el período abierto más antiguo del ejercicio (cierre secuencial).
 * Bloquea si hay asientos pendientes de revisión. Registra en el log. (US 1.2.3)
 */
export const closePeriod = createServerFn({ method: 'POST' })
  .validator(z.object({ periodId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { period, fy } = await loadPeriodForOrg(ctx.data.periodId, orgId);
    if (fy.estado === 'cerrado') throw new Error('El ejercicio está cerrado');
    if (period.estado === 'cerrado')
      throw new Error('El período ya está cerrado');

    const [earliest] = await db
      .select({ id: periodoContable.id })
      .from(periodoContable)
      .where(
        and(
          eq(periodoContable.ejercicioId, fy.id),
          eq(periodoContable.estado, 'abierto')
        )
      )
      .orderBy(asc(periodoContable.periodo))
      .limit(1);
    if (earliest?.id !== period.id) {
      throw new Error(
        'Solo se puede cerrar el período abierto más antiguo (no se cierran períodos salteados)'
      );
    }

    const pending = await countPendingReviewEntries(period.id, orgId);
    if (pending > 0) {
      throw new Error(
        `No se puede cerrar: hay ${pending} asiento(s) pendiente(s) de revisión`
      );
    }

    await db
      .update(periodoContable)
      .set({ estado: 'cerrado', cerradoAt: new Date(), cerradoPor: userId })
      .where(eq(periodoContable.id, period.id));

    await db.insert(evento).values(
      accountingEvent({
        orgId,
        clientId: period.clienteId,
        eventType: 'period_closed',
        entityId: period.id,
        fiscalYearId: fy.id,
        data: {
          periodId: period.id,
          year: periodoYear(period.periodo),
          month: periodoMonth(period.periodo),
        },
        userId,
      })
    );

    return { ok: true };
  });

/**
 * Reabre un período cerrado con motivo obligatorio. Los asientos se conservan.
 * Registra en el log con usuario, fecha y motivo. (US 1.2.4)
 */
export const reopenPeriod = createServerFn({ method: 'POST' })
  .validator(
    z.object({ periodId: z.string().uuid(), reason: z.string().trim().min(1) })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { period, fy } = await loadPeriodForOrg(ctx.data.periodId, orgId);
    if (fy.estado === 'cerrado') {
      throw new Error('El ejercicio está cerrado. Reabrí el ejercicio primero');
    }
    if (period.estado !== 'cerrado')
      throw new Error('El período no está cerrado');

    await db
      .update(periodoContable)
      .set({ estado: 'abierto', cerradoAt: null, cerradoPor: null })
      .where(eq(periodoContable.id, period.id));

    await db.insert(evento).values(
      accountingEvent({
        orgId,
        clientId: period.clienteId,
        eventType: 'period_reopened',
        entityId: period.id,
        fiscalYearId: fy.id,
        data: {
          periodId: period.id,
          year: periodoYear(period.periodo),
          month: periodoMonth(period.periodo),
          reason: ctx.data.reason.trim(),
        },
        userId,
      })
    );

    return { ok: true };
  });

/** Log auditable de cierres/reaperturas de un ejercicio. */
export const getAccountingLog = createServerFn({ method: 'GET' })
  .validator(z.object({ fiscalYearId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    return db
      .select({
        id: evento.id,
        eventType: eventoAccion,
        eventData: sql<{
          periodId?: string;
          year?: number;
          month?: number;
          reason?: string;
        } | null>`${evento.detalle}`,
        createdAt: evento.at,
        userName: user.name,
        userEmail: user.email,
      })
      .from(evento)
      .leftJoin(user, eq(user.id, evento.actorId))
      .where(
        and(
          eq(evento.orgId, orgId),
          sql`${evento.detalle}->>'ejercicioId' = ${fy.id}`,
          // Esta vista es solo el historial de cierres/reaperturas; no eventos de asientos.
          inArray(eventoAccion, [
            'period_closed',
            'period_reopened',
            'fiscal_year_closed',
            'fiscal_year_reopened',
          ])
        )
      )
      .orderBy(desc(evento.at));
  });

/* ── Log auditable completo, filtrable, solo Owner (UST3) ── */

export const AUDIT_EVENT_TYPES = [
  'journal_entry_created',
  'journal_entry_edited',
  'journal_entry_voided',
  'period_closed',
  'period_reopened',
  'fiscal_year_closed',
  'fiscal_year_reopened',
  'account_created',
  'account_deactivated',
  'financial_statement_approved',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export type AuditEventData = Record<
  string,
  string | number | boolean | null
> | null;

export interface AuditLogEntry {
  id: string;
  eventType: AuditEventType;
  eventData: AuditEventData;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

/**
 * Log auditable de TODAS las acciones sensibles del módulo para una empresa,
 * con filtro opcional por tipo de evento. Solo Owner del estudio. (UST3)
 */
export const getAuditLog = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      eventTypes: z.array(z.enum(AUDIT_EVENT_TYPES)).optional(),
      limit: z.number().int().min(1).max(1000).optional(),
    })
  )
  .handler(async (ctx): Promise<AuditLogEntry[]> => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const types =
      ctx.data.eventTypes && ctx.data.eventTypes.length > 0
        ? ctx.data.eventTypes
        : [...AUDIT_EVENT_TYPES];

    const rows = await db
      .select({
        id: evento.id,
        eventType: eventoAccion,
        eventData: evento.detalle,
        createdAt: evento.at,
        userName: user.name,
        userEmail: user.email,
      })
      .from(evento)
      .leftJoin(user, eq(user.id, evento.actorId))
      .where(and(eq(evento.clienteId, clientId), inArray(eventoAccion, types)))
      .orderBy(desc(evento.at))
      .limit(ctx.data.limit ?? 300);

    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType as AuditEventType,
      eventData: (r.eventData as AuditEventData) ?? null,
      createdAt: r.createdAt,
      userName: r.userName ?? null,
      userEmail: r.userEmail ?? null,
    }));
  });

/* ═══════════════════ ASIENTOS / LIBRO DIARIO (US 1.3.x) ═══════════════════ */

type JournalEntryRow = typeof asiento.$inferSelect;

/** Valida que un asiento pertenezca al estudio y lo devuelve. */
async function loadJournalEntryForOrg(
  entryId: string,
  orgId: string
): Promise<JournalEntryRow> {
  const [row] = await db
    .select({ je: asiento })
    .from(asiento)
    .where(and(eq(asiento.id, entryId), eq(asiento.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Asiento no encontrado o no autorizado');
  return row.je;
}

/** Resuelve el ejercicio y período mensual al que cae una fecha (YYYY-MM-DD). */
async function resolvePeriodForDate(clientId: string, dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Fecha inválida');
  const [fy] = await db
    .select()
    .from(ejercicio)
    .where(
      and(
        eq(ejercicio.clienteId, clientId),
        lte(ejercicio.fechaDesde, dateStr),
        gte(ejercicio.fechaHasta, dateStr)
      )
    )
    .limit(1);
  if (!fy) {
    throw new Error(
      'No hay un ejercicio que cubra esa fecha. Creá el ejercicio primero'
    );
  }
  const [period] = await db
    .select()
    .from(periodoContable)
    .where(
      and(
        eq(periodoContable.ejercicioId, fy.id),
        eq(periodoContable.periodo, `${dateStr.slice(0, 7)}-01`)
      )
    )
    .limit(1);
  if (!period) throw new Error('No existe el período para esa fecha');
  return { fy, period, date: dateStr };
}

/** Valida importes de líneas: cada línea Debe XOR Haber, y total Debe = total Haber. */
function validateLineAmounts(lines: { debit: number; credit: number }[]) {
  let td = 0;
  let tc = 0;
  for (const l of lines) {
    const hasD = l.debit > 0;
    const hasC = l.credit > 0;
    if (hasD && hasC) {
      throw new Error(
        'Cada línea debe tener importe en Debe o en Haber, no en ambos'
      );
    }
    if (!hasD && !hasC) {
      throw new Error('Cada línea debe tener un importe en Debe o en Haber');
    }
    td += l.debit;
    tc += l.credit;
  }
  if (Math.abs(td - tc) > 0.005) {
    throw new Error(
      `El asiento no balancea: Debe ${td.toFixed(2)} ≠ Haber ${tc.toFixed(2)}`
    );
  }
  return { totalDebit: td, totalCredit: tc };
}

/** Valida que las cuentas de las líneas sean imputables y activas para la empresa. */
async function assertPostableAccounts(
  clientId: string,
  orgId: string,
  accountIds: string[]
) {
  const ids = [...new Set(accountIds)];
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
    if (!active)
      throw new Error(`La cuenta ${a.codigo} está inactiva para esta empresa`);
  }
}

/** Cuentas imputables y activas de la empresa, para el selector de líneas del asiento. */
export const getPostableAccounts = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const accounts = await db
      .select()
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          sql`(${cuenta.alcance} = 'base' OR (${cuenta.alcance} = 'propia' AND ${cuenta.clienteId} = ${ctx.data.clientId}))`
        )
      )
      .orderBy(asc(cuenta.codigo));

    const overrides = await db
      .select()
      .from(clienteCuenta)
      .where(eq(clienteCuenta.clienteId, ctx.data.clientId));
    const ovMap = new Map(overrides.map((o) => [o.cuentaId, o]));

    return accounts
      .filter((a) => ovMap.get(a.id)?.activa ?? a.activa)
      .map((a) => ({
        id: a.id,
        code: a.codigo,
        name: ovMap.get(a.id)?.nombrePropio ?? a.nombre,
        accountGroup: a.rubro,
      }));
  });

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().min(0),
  credit: z.number().min(0),
  description: z.string().optional(),
});

/** Crea un asiento manual con numeración consecutiva por ejercicio. (US 1.3.1) */
export const createJournalEntry = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      entryDate: z.string(),
      description: z.string().optional(),
      lines: z.array(journalLineSchema).min(2),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const { fy, period, date } = await resolvePeriodForDate(
      clientId,
      ctx.data.entryDate
    );
    if (fy.estado === 'cerrado') {
      throw new Error(
        'No se puede cargar el asiento: el ejercicio está cerrado'
      );
    }
    if (period.estado === 'cerrado') {
      throw new Error('No se puede cargar el asiento: el período está cerrado');
    }
    validateLineAmounts(ctx.data.lines);
    await assertPostableAccounts(
      clientId,
      orgId,
      ctx.data.lines.map((l) => l.accountId)
    );

    const entry = await db.transaction(async (tx) => {
      const [{ maxNum }] = await tx
        .select({
          maxNum: sql<number>`coalesce(max(${asiento.numero}),0)::int`,
        })
        .from(asiento)
        .where(
          and(eq(asiento.clienteId, clientId), eq(asiento.ejercicioId, fy.id))
        );
      const number = (maxNum ?? 0) + 1;

      const [je] = await tx
        .insert(asiento)
        .values({
          orgId,
          clienteId: clientId,
          ejercicioId: fy.id,
          periodoId: period.id,
          numero: number,
          fecha: date,
          descripcion: ctx.data.description?.trim()
            ? ctx.data.description.trim()
            : null,
          origenTipo: 'manual',
          creadoPor: userId,
        })
        .returning();

      await tx.insert(asientoLinea).values(
        ctx.data.lines.map((l, i) => ({
          asientoId: je.id,
          cuentaId: l.accountId,
          debe: String(l.debit),
          haber: String(l.credit),
          descripcion: l.description?.trim() ? l.description.trim() : null,
          orden: i,
        }))
      );
      return je;
    });

    return entry;
  });

/** Edita un asiento (solo si su período está abierto). (US 1.3.2) */
export const updateJournalEntry = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      entryDate: z.string(),
      description: z.string().optional(),
      lines: z.array(journalLineSchema).min(2),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const entry = await loadJournalEntryForOrg(ctx.data.id, orgId);
    if (entry.anulado) throw new Error('No se puede editar un asiento anulado');

    // El período actual del asiento debe estar abierto.
    const { period: currentPeriod } = await loadPeriodForOrg(
      entry.periodoId,
      orgId
    );
    if (currentPeriod.estado === 'cerrado') {
      throw new Error(
        'No se puede editar: el período del asiento está cerrado'
      );
    }

    // Resolver el período de la (posible nueva) fecha; debe ser del mismo ejercicio y abierto.
    const { fy, period, date } = await resolvePeriodForDate(
      entry.clienteId,
      ctx.data.entryDate
    );
    if (fy.id !== entry.ejercicioId) {
      throw new Error(
        'La fecha debe estar dentro del mismo ejercicio del asiento'
      );
    }
    if (period.estado === 'cerrado') {
      throw new Error('No se puede mover el asiento a un período cerrado');
    }

    validateLineAmounts(ctx.data.lines);
    await assertPostableAccounts(
      entry.clienteId,
      orgId,
      ctx.data.lines.map((l) => l.accountId)
    );

    await db.transaction(async (tx) => {
      await tx
        .update(asiento)
        .set({
          fecha: date,
          periodoId: period.id,
          descripcion: ctx.data.description?.trim()
            ? ctx.data.description.trim()
            : null,
          // Si era un asiento auto (factura/sueldos), marcarlo como editado a mano:
          // la regeneración posterior pedirá confirmación antes de sobreescribir.
          editadoPostGeneracion:
            entry.origenTipo === 'manual' ? entry.editadoPostGeneracion : true,
        })
        .where(eq(asiento.id, entry.id));
      await tx.delete(asientoLinea).where(eq(asientoLinea.asientoId, entry.id));
      await tx.insert(asientoLinea).values(
        ctx.data.lines.map((l, i) => ({
          asientoId: entry.id,
          cuentaId: l.accountId,
          debe: String(l.debit),
          haber: String(l.credit),
          descripcion: l.description?.trim() ? l.description.trim() : null,
          orden: i,
        }))
      );
      await tx.insert(evento).values(
        accountingEvent({
          orgId,
          clientId: entry.clienteId,
          eventType: 'journal_entry_edited',
          entityId: entry.id,
          fiscalYearId: entry.ejercicioId,
          data: { entryId: entry.id, number: entry.numero },
          userId,
        })
      );
    });

    return { ok: true };
  });

/** Anula un asiento sin borrarlo, conservando su número. (US 1.3.3) */
export const voidJournalEntry = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(1) })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const entry = await loadJournalEntryForOrg(ctx.data.id, orgId);
    if (entry.anulado) throw new Error('El asiento ya está anulado');
    const { period } = await loadPeriodForOrg(entry.periodoId, orgId);
    if (period.estado === 'cerrado') {
      throw new Error(
        'No se puede anular: el período del asiento está cerrado'
      );
    }

    await db
      .update(asiento)
      .set({
        anulado: true,
        anuladoAt: new Date(),
        anuladoPor: userId,
        motivoAnulacion: ctx.data.reason.trim(),
      })
      .where(eq(asiento.id, entry.id));

    await db.insert(evento).values(
      accountingEvent({
        orgId,
        clientId: entry.clienteId,
        eventType: 'journal_entry_voided',
        entityId: entry.id,
        fiscalYearId: entry.ejercicioId,
        data: {
          entryId: entry.id,
          number: entry.numero,
          reason: ctx.data.reason.trim(),
        },
        userId,
      })
    );

    return { ok: true };
  });

export interface JournalEntryListRow {
  id: string;
  number: number;
  entryDate: string | Date;
  description: string | null;
  origin: string;
  isVoided: boolean;
  total: number;
  lineCount: number;
}

/** Lista paginada de asientos del ejercicio con filtros. (US 1.3.4) */
export const listJournalEntries = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      accountId: z.string().uuid().optional(),
      origin: z
        .enum([
          'manual',
          'comprobante',
          'recibo',
          'movimiento_bancario',
          'cierre',
          'apertura',
          'import',
        ])
        .optional(),
      includeVoided: z.boolean().default(false),
      sortBy: z.enum(['number', 'date']).default('number'),
      sortDir: z.enum(['asc', 'desc']).default('desc'),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);

    // Ejercicio: el indicado, o el abierto, o el más reciente.
    let fyId = d.fiscalYearId;
    if (!fyId) {
      const [fy] = await db
        .select({ id: ejercicio.id })
        .from(ejercicio)
        .where(eq(ejercicio.clienteId, d.clientId))
        .orderBy(
          sql`case when ${ejercicio.estado} = 'abierto' then 0 else 1 end`,
          desc(ejercicio.numero)
        )
        .limit(1);
      fyId = fy?.id;
    }
    if (!fyId) {
      return {
        rows: [] as JournalEntryListRow[],
        total: 0,
        fiscalYearId: null,
      };
    }

    const conditions = [
      eq(asiento.clienteId, d.clientId),
      eq(asiento.ejercicioId, fyId),
    ];
    if (!d.includeVoided) conditions.push(eq(asiento.anulado, false));
    if (d.origin) conditions.push(eq(asiento.origenTipo, d.origin));
    if (d.from) conditions.push(gte(asiento.fecha, d.from));
    if (d.to) conditions.push(lte(asiento.fecha, d.to));

    if (d.accountId) {
      const lineEntries = await db
        .selectDistinct({ id: asientoLinea.asientoId })
        .from(asientoLinea)
        .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
        .where(
          and(
            eq(asiento.clienteId, d.clientId),
            eq(asientoLinea.cuentaId, d.accountId)
          )
        );
      const ids = lineEntries.map((r) => r.id);
      if (ids.length === 0) {
        return {
          rows: [] as JournalEntryListRow[],
          total: 0,
          fiscalYearId: fyId,
        };
      }
      conditions.push(inArray(asiento.id, ids));
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(asiento)
      .where(and(...conditions));

    const orderCol = d.sortBy === 'date' ? asiento.fecha : asiento.numero;
    const rows = await db
      .select({
        id: asiento.id,
        number: asiento.numero,
        entryDate: asiento.fecha,
        description: asiento.descripcion,
        origin: asiento.origenTipo,
        isVoided: asiento.anulado,
      })
      .from(asiento)
      .where(and(...conditions))
      .orderBy(d.sortDir === 'asc' ? asc(orderCol) : desc(orderCol))
      .limit(d.pageSize)
      .offset((d.page - 1) * d.pageSize);

    // Totales y cantidad de líneas por asiento (query agregado aparte).
    const pageIds = rows.map((r) => r.id);
    const totalsByEntry = new Map<
      string,
      { total: number; lineCount: number }
    >();
    if (pageIds.length > 0) {
      const stats = await db
        .select({
          journalEntryId: asientoLinea.asientoId,
          total: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(asientoLinea)
        .where(inArray(asientoLinea.asientoId, pageIds))
        .groupBy(asientoLinea.asientoId);
      for (const s of stats) {
        totalsByEntry.set(s.journalEntryId, {
          total: parseFloat(s.total),
          lineCount: s.lineCount,
        });
      }
    }

    return {
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        entryDate: r.entryDate,
        description: r.description,
        origin: r.origin,
        isVoided: r.isVoided,
        total: totalsByEntry.get(r.id)?.total ?? 0,
        lineCount: totalsByEntry.get(r.id)?.lineCount ?? 0,
      })),
      total: count,
      fiscalYearId: fyId,
    };
  });

/** Detalle completo de un asiento: cabecera, líneas, origen y log adjunto. (US 1.3.5) */
export const getJournalEntry = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const entry = await loadJournalEntryForOrg(ctx.data.id, orgId);

    const [meta] = await db
      .select({
        fyNumber: ejercicio.numero,
        periodo: periodoContable.periodo,
        periodStatus: periodoContable.estado,
        createdByName: user.name,
        createdByEmail: user.email,
      })
      .from(asiento)
      .leftJoin(ejercicio, eq(ejercicio.id, asiento.ejercicioId))
      .leftJoin(periodoContable, eq(periodoContable.id, asiento.periodoId))
      .leftJoin(user, eq(user.id, asiento.creadoPor))
      .where(eq(asiento.id, entry.id))
      .limit(1);

    const lines = await db
      .select({
        id: asientoLinea.id,
        accountId: asientoLinea.cuentaId,
        accountCode: cuenta.codigo,
        accountName: cuenta.nombre,
        debit: asientoLinea.debe,
        credit: asientoLinea.haber,
        description: asientoLinea.descripcion,
        lineOrder: asientoLinea.orden,
      })
      .from(asientoLinea)
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(eq(asientoLinea.asientoId, entry.id))
      .orderBy(asc(asientoLinea.orden));

    const logRows = await db
      .select({
        id: evento.id,
        eventType: eventoAccion,
        eventData: sql<{ reason?: string } | null>`${evento.detalle}`,
        createdAt: evento.at,
        userName: user.name,
        userEmail: user.email,
      })
      .from(evento)
      .leftJoin(user, eq(user.id, evento.actorId))
      .where(
        and(
          eq(evento.clienteId, entry.clienteId),
          inArray(eventoAccion, [
            'journal_entry_edited',
            'journal_entry_voided',
          ]),
          sql`${evento.detalle}->>'entryId' = ${entry.id}`
        )
      )
      .orderBy(desc(evento.at));

    // Comprobante origen (si el asiento vino de una factura) y regla aplicada. (US 1.3.5)
    let source: {
      kind: 'comprobante';
      id: string;
      label: string;
      counterparty: string;
      amount: number;
    } | null = null;
    if (entry.origenTipo === 'comprobante' && entry.origenId) {
      const [inv] = await db
        .select({
          id: comprobante.id,
          type: comprobante.tipo,
          salePoint: comprobante.puntoVenta,
          numero: comprobante.numero,
          direction: comprobante.direccion,
          counterparty: contraparte.nombre,
          amount: comprobante.total,
        })
        .from(comprobante)
        .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
        .where(eq(comprobante.id, entry.origenId))
        .limit(1);
      if (inv) {
        const pv = String(inv.salePoint).padStart(5, '0');
        const nro = String(inv.numero).padStart(8, '0');
        source = {
          kind: 'comprobante',
          id: inv.id,
          label: `Factura ${inv.type} ${pv}-${nro}`,
          counterparty: inv.counterparty ?? '',
          amount: parseFloat(inv.amount),
        };
      }
    }

    let rule: { id: string; name: string } | null = null;
    if (entry.reglaId) {
      const [r] = await db
        .select({ id: reglaMapeo.id, name: reglaMapeo.nombre })
        .from(reglaMapeo)
        .where(eq(reglaMapeo.id, entry.reglaId))
        .limit(1);
      if (r) rule = r;
    }

    return {
      entry: {
        ...entry,
        fyNumber: meta?.fyNumber ?? null,
        periodYear: meta?.periodo ? periodoYear(meta.periodo) : null,
        periodMonth: meta?.periodo ? periodoMonth(meta.periodo) : null,
        periodStatus: meta?.periodStatus ?? null,
        createdByName: meta?.createdByName ?? meta?.createdByEmail ?? null,
      },
      lines: lines.map((l) => ({
        ...l,
        debit: parseFloat(l.debit),
        credit: parseFloat(l.credit),
      })),
      log: logRows,
      source,
      rule,
    };
  });

/* ═══════════════════════ MAYOR / LIBRO MAYOR (US 2.1.x) ═══════════════════════ */

/** Resuelve el ejercicio: el indicado, o el abierto, o el más reciente. */
async function resolveFiscalYear(
  clientId: string,
  orgId: string,
  fiscalYearId?: string
): Promise<FiscalYearRow | null> {
  if (fiscalYearId) return loadFiscalYearForOrg(fiscalYearId, orgId);
  const [fy] = await db
    .select()
    .from(ejercicio)
    .where(eq(ejercicio.clienteId, clientId))
    .orderBy(
      sql`case when ${ejercicio.estado} = 'abierto' then 0 else 1 end`,
      desc(ejercicio.numero)
    )
    .limit(1);
  return fy ?? null;
}

export interface LedgerRow {
  entryId: string;
  number: number;
  entryDate: string | Date;
  description: string | null;
  lineDescription: string | null;
  origin: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Mayor de una cuenta puntual con saldo inicial, movimientos y saldo final. (US 2.1.1) */
export const getLedgerAccount = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      accountId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      origin: z
        .enum([
          'manual',
          'comprobante',
          'recibo',
          'movimiento_bancario',
          'cierre',
          'apertura',
          'import',
        ])
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);
    const acc = await loadAccountForClient(d.accountId, orgId, d.clientId);
    const fy = await resolveFiscalYear(d.clientId, orgId, d.fiscalYearId);
    if (!fy) {
      return null;
    }

    const fromDate = d.from ? d.from : fy.fechaDesde;
    const toDate = d.to ? d.to : fy.fechaHasta;

    // Saldo inicial = neto acumulado antes de `fromDate` dentro del ejercicio.
    const [si] = await db
      .select({
        d: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        h: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(
        and(
          eq(asiento.clienteId, d.clientId),
          eq(asientoLinea.cuentaId, d.accountId),
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          lt(asiento.fecha, fromDate)
        )
      );
    const saldoInicial = parseFloat(si.d) - parseFloat(si.h);

    const conds = [
      eq(asiento.clienteId, d.clientId),
      eq(asientoLinea.cuentaId, d.accountId),
      eq(asiento.ejercicioId, fy.id),
      eq(asiento.anulado, false),
      gte(asiento.fecha, fromDate),
      lte(asiento.fecha, toDate),
    ];
    if (d.origin) conds.push(eq(asiento.origenTipo, d.origin));

    const raw = await db
      .select({
        entryId: asiento.id,
        number: asiento.numero,
        entryDate: asiento.fecha,
        description: asiento.descripcion,
        origin: asiento.origenTipo,
        lineDescription: asientoLinea.descripcion,
        debit: asientoLinea.debe,
        credit: asientoLinea.haber,
        lineOrder: asientoLinea.orden,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(and(...conds))
      .orderBy(
        asc(asiento.fecha),
        asc(asiento.numero),
        asc(asientoLinea.orden)
      );

    let running = saldoInicial;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows: LedgerRow[] = raw.map((r) => {
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      running += debit - credit;
      totalDebit += debit;
      totalCredit += credit;
      return {
        entryId: r.entryId,
        number: r.number,
        entryDate: r.entryDate,
        description: r.description,
        lineDescription: r.lineDescription,
        origin: r.origin,
        debit,
        credit,
        balance: running,
      };
    });

    return {
      cuenta: { id: acc.id, code: acc.codigo, name: acc.nombre },
      ejercicio: { id: fy.id, number: fy.numero },
      from: fromDate,
      to: toDate,
      saldoInicial,
      rows,
      totalDebit,
      totalCredit,
      saldoFinal: saldoInicial + totalDebit - totalCredit,
    };
  });

export interface ConsolidatedAccount {
  accountId: string;
  code: string;
  name: string;
  saldoInicial: number;
  movements: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  saldoFinal: number;
}

/** Mayor consolidado: todas las cuentas con movimientos en el rango, agrupadas. (US 2.1.2) */
export const getLedgerConsolidated = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      origin: z
        .enum([
          'manual',
          'comprobante',
          'recibo',
          'movimiento_bancario',
          'cierre',
          'apertura',
          'import',
        ])
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);
    const fy = await resolveFiscalYear(d.clientId, orgId, d.fiscalYearId);
    if (!fy) {
      return {
        ejercicio: null,
        accounts: [],
        grandTotalDebit: 0,
        grandTotalCredit: 0,
      };
    }

    const fromDate = d.from ? d.from : fy.fechaDesde;
    const toDate = d.to ? d.to : fy.fechaHasta;

    // Saldos iniciales por cuenta (antes de fromDate).
    const initials = await db
      .select({
        accountId: asientoLinea.cuentaId,
        d: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        h: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(
        and(
          eq(asiento.clienteId, d.clientId),
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          lt(asiento.fecha, fromDate)
        )
      )
      .groupBy(asientoLinea.cuentaId);
    const initialByAccount = new Map(
      initials.map((i) => [i.accountId, parseFloat(i.d) - parseFloat(i.h)])
    );

    const conds = [
      eq(asiento.clienteId, d.clientId),
      eq(asiento.ejercicioId, fy.id),
      eq(asiento.anulado, false),
      gte(asiento.fecha, fromDate),
      lte(asiento.fecha, toDate),
    ];
    if (d.origin) conds.push(eq(asiento.origenTipo, d.origin));

    const raw = await db
      .select({
        accountId: asientoLinea.cuentaId,
        code: cuenta.codigo,
        name: cuenta.nombre,
        entryId: asiento.id,
        number: asiento.numero,
        entryDate: asiento.fecha,
        description: asiento.descripcion,
        origin: asiento.origenTipo,
        lineDescription: asientoLinea.descripcion,
        debit: asientoLinea.debe,
        credit: asientoLinea.haber,
        lineOrder: asientoLinea.orden,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(and(...conds))
      .orderBy(
        asc(cuenta.codigo),
        asc(asiento.fecha),
        asc(asiento.numero),
        asc(asientoLinea.orden)
      );

    const byAccount = new Map<string, ConsolidatedAccount>();
    // Sembrar cuentas que tienen saldo inicial aunque no tengan movimientos en el rango.
    for (const [accId, sIni] of initialByAccount) {
      if (sIni === 0) continue;
      byAccount.set(accId, {
        accountId: accId,
        code: '',
        name: '',
        saldoInicial: sIni,
        movements: [],
        totalDebit: 0,
        totalCredit: 0,
        saldoFinal: sIni,
      });
    }

    for (const r of raw) {
      let acc = byAccount.get(r.accountId);
      if (!acc) {
        const sIni = initialByAccount.get(r.accountId) ?? 0;
        acc = {
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          saldoInicial: sIni,
          movements: [],
          totalDebit: 0,
          totalCredit: 0,
          saldoFinal: sIni,
        };
        byAccount.set(r.accountId, acc);
      }
      acc.code = r.code;
      acc.name = r.name;
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      acc.totalDebit += debit;
      acc.totalCredit += credit;
      acc.saldoFinal += debit - credit;
      acc.movements.push({
        entryId: r.entryId,
        number: r.number,
        entryDate: r.entryDate,
        description: r.description,
        lineDescription: r.lineDescription,
        origin: r.origin,
        debit,
        credit,
        balance: acc.saldoFinal,
      });
    }

    // Completar code/name de cuentas que solo tenían saldo inicial (sin movimientos).
    const missing = [...byAccount.values()].filter((a) => !a.code);
    if (missing.length > 0) {
      const metas = await db
        .select({ id: cuenta.id, code: cuenta.codigo, name: cuenta.nombre })
        .from(cuenta)
        .where(
          inArray(
            cuenta.id,
            missing.map((m) => m.accountId)
          )
        );
      const metaById = new Map(metas.map((m) => [m.id, m]));
      for (const a of missing) {
        const m = metaById.get(a.accountId);
        if (m) {
          a.code = m.code;
          a.name = m.name;
        }
      }
    }

    const accounts = [...byAccount.values()].sort((a, b) =>
      a.code.localeCompare(b.code, 'es', { numeric: true })
    );
    const grandTotalDebit = accounts.reduce((s, a) => s + a.totalDebit, 0);
    const grandTotalCredit = accounts.reduce((s, a) => s + a.totalCredit, 0);

    return {
      ejercicio: { id: fy.id, number: fy.numero },
      from: fromDate,
      to: toDate,
      accounts,
      grandTotalDebit,
      grandTotalCredit,
    };
  });

/* ═══════════════ BALANCE DE SUMAS Y SALDOS (US 2.2.x) ═══════════════ */

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  sumaDebe: number;
  sumaHaber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

/** Balance de sumas y saldos a una fecha de corte. (US 2.2.1) */
export const getTrialBalance = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      asOf: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);
    const fy = await resolveFiscalYear(d.clientId, orgId, d.fiscalYearId);
    if (!fy) return null;

    const corte = d.asOf ? d.asOf : fy.fechaHasta;

    const raw = await db
      .select({
        accountId: asientoLinea.cuentaId,
        code: cuenta.codigo,
        name: cuenta.nombre,
        d: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        h: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(
        and(
          eq(asiento.clienteId, d.clientId),
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          lte(asiento.fecha, corte)
        )
      )
      .groupBy(asientoLinea.cuentaId, cuenta.codigo, cuenta.nombre)
      .orderBy(asc(cuenta.codigo));

    let tDebe = 0;
    let tHaber = 0;
    let tDeudor = 0;
    let tAcreedor = 0;
    const rows: TrialBalanceRow[] = raw.map((r) => {
      const sumaDebe = parseFloat(r.d);
      const sumaHaber = parseFloat(r.h);
      const saldo = sumaDebe - sumaHaber;
      const saldoDeudor = saldo > 0 ? saldo : 0;
      const saldoAcreedor = saldo < 0 ? -saldo : 0;
      tDebe += sumaDebe;
      tHaber += sumaHaber;
      tDeudor += saldoDeudor;
      tAcreedor += saldoAcreedor;
      return {
        accountId: r.accountId,
        code: r.code,
        name: r.name,
        sumaDebe,
        sumaHaber,
        saldoDeudor,
        saldoAcreedor,
      };
    });

    const balanced =
      Math.abs(tDebe - tHaber) < 0.005 && Math.abs(tDeudor - tAcreedor) < 0.005;

    return {
      ejercicio: { id: fy.id, number: fy.numero },
      fiscalYearStart: fy.fechaDesde,
      asOf: corte,
      rows,
      totals: {
        sumaDebe: tDebe,
        sumaHaber: tHaber,
        saldoDeudor: tDeudor,
        saldoAcreedor: tAcreedor,
      },
      balanced,
    };
  });

/* ═══════════════ LIBRO DIARIO — export (US 2.3.1) ═══════════════ */

export interface JournalBookLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
}
export interface JournalBookEntry {
  number: number;
  entryDate: string | Date;
  description: string | null;
  origin: string;
  isVoided: boolean;
  voidReason: string | null;
  lines: JournalBookLine[];
}

/** Todos los asientos del ejercicio (incl. anulados) con sus líneas, para el Libro Diario. (US 2.3.1) */
export const getJournalBook = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await resolveFiscalYear(clientId, orgId, ctx.data.fiscalYearId);
    if (!fy) return null;

    const [empresa] = await db
      .select({ name: cliente.razonSocial, cuit: cliente.cuit })
      .from(cliente)
      .where(eq(cliente.id, clientId))
      .limit(1);

    const entries = await db
      .select({
        id: asiento.id,
        number: asiento.numero,
        entryDate: asiento.fecha,
        description: asiento.descripcion,
        origin: asiento.origenTipo,
        isVoided: asiento.anulado,
        voidReason: asiento.motivoAnulacion,
      })
      .from(asiento)
      .where(
        and(eq(asiento.clienteId, clientId), eq(asiento.ejercicioId, fy.id))
      )
      .orderBy(asc(asiento.numero));

    const lineRows = await db
      .select({
        entryId: asientoLinea.asientoId,
        accountCode: cuenta.codigo,
        accountName: cuenta.nombre,
        debit: asientoLinea.debe,
        credit: asientoLinea.haber,
        description: asientoLinea.descripcion,
        lineOrder: asientoLinea.orden,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(
        and(eq(asiento.clienteId, clientId), eq(asiento.ejercicioId, fy.id))
      )
      .orderBy(asc(asiento.numero), asc(asientoLinea.orden));

    const linesByEntry = new Map<string, JournalBookLine[]>();
    for (const l of lineRows) {
      const list = linesByEntry.get(l.entryId) ?? [];
      list.push({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: parseFloat(l.debit),
        credit: parseFloat(l.credit),
        description: l.description,
      });
      linesByEntry.set(l.entryId, list);
    }

    const result: JournalBookEntry[] = entries.map((e) => ({
      number: e.number,
      entryDate: e.entryDate,
      description: e.description,
      origin: e.origin,
      isVoided: e.isVoided,
      voidReason: e.voidReason,
      lines: linesByEntry.get(e.id) ?? [],
    }));

    return {
      empresaName: empresa?.name ?? '',
      cuit: empresa?.cuit ?? '',
      ejercicio: {
        number: fy.numero,
        startDate: fy.fechaDesde,
        endDate: fy.fechaHasta,
      },
      entries: result,
    };
  });

/* ═══════════════ REGLAS DE MAPEO (US 3.1.x) ═══════════════ */

type MappingRuleRow = typeof reglaMapeo.$inferSelect;

async function loadMappingRuleForOrg(
  ruleId: string,
  orgId: string
): Promise<MappingRuleRow> {
  const [row] = await db
    .select({ r: reglaMapeo })
    .from(reglaMapeo)
    .where(and(eq(reglaMapeo.id, ruleId), eq(reglaMapeo.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Regla no encontrada o no autorizada');
  return row.r;
}

interface RuleLineInput {
  side: 'debe' | 'haber';
  amountBasis: string;
  fixedAmount?: number | null;
}
function validateRuleLines(lines: RuleLineInput[]): void {
  if (lines.length < 2)
    throw new Error('La regla debe tener al menos 2 líneas');
  const hasDebit = lines.some((l) => l.side === 'debe');
  const hasCredit = lines.some((l) => l.side === 'haber');
  if (!hasDebit || !hasCredit) {
    throw new Error(
      'La regla debe tener al menos una línea al Debe y una al Haber para que el asiento pueda cuadrar'
    );
  }
  for (const l of lines) {
    if (
      l.amountBasis === 'fijo' &&
      (l.fixedAmount == null || l.fixedAmount <= 0)
    ) {
      throw new Error(
        'Las líneas con base "monto fijo" requieren un importe mayor a 0'
      );
    }
  }
}

const mappingLineSchema = z.object({
  accountId: z.string().uuid(),
  side: z.enum(['debe', 'haber']),
  amountBasis: z.enum([
    'total',
    'neto',
    'iva',
    'otros_tributos',
    'valor_concepto',
    'fijo',
  ]),
  fixedAmount: z.number().nullable().optional(),
  description: z.string().optional(),
});

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };
export type RuleCondition = Record<string, JsonValue> | null;

export interface MappingRuleListRow {
  id: string;
  name: string;
  sourceModule: string;
  ruleType: string;
  condition: RuleCondition;
  priority: number;
  isActive: boolean;
  lineCount: number;
}

/** Lista reglas de una empresa, ordenadas por prioridad. (US 3.1.2) */
export const listMappingRules = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      sourceModule: z
        .enum(['comprobante', 'recibo', 'movimiento_bancario'])
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const conds = [eq(reglaMapeo.clienteId, ctx.data.clientId)];
    if (ctx.data.sourceModule)
      conds.push(eq(reglaMapeo.modulo, ctx.data.sourceModule));

    const rules = await db
      .select()
      .from(reglaMapeo)
      .where(and(...conds))
      .orderBy(asc(reglaMapeo.prioridad), asc(reglaMapeo.nombre));

    const ids = rules.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const cRows = await db
        .select({
          ruleId: reglaMapeoLinea.reglaId,
          n: sql<number>`count(*)::int`,
        })
        .from(reglaMapeoLinea)
        .where(inArray(reglaMapeoLinea.reglaId, ids))
        .groupBy(reglaMapeoLinea.reglaId);
      for (const c of cRows) counts.set(c.ruleId, c.n);
    }

    return rules.map(
      (r): MappingRuleListRow => ({
        id: r.id,
        name: r.nombre,
        sourceModule: r.modulo,
        ruleType: r.tipo,
        condition: (r.condicion ?? null) as RuleCondition,
        priority: r.prioridad,
        isActive: r.activa,
        lineCount: counts.get(r.id) ?? 0,
      })
    );
  });

/** Detalle de una regla con sus líneas + cuántos asientos del período abierto generó. */
export const getMappingRule = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const rule = await loadMappingRuleForOrg(ctx.data.id, orgId);

    const lines = await db
      .select({
        id: reglaMapeoLinea.id,
        accountId: reglaMapeoLinea.cuentaId,
        accountCode: cuenta.codigo,
        accountName: cuenta.nombre,
        side: reglaMapeoLinea.lado,
        amountBasis: reglaMapeoLinea.base,
        fixedAmount: reglaMapeoLinea.importeFijo,
        description: reglaMapeoLinea.descripcion,
        lineOrder: reglaMapeoLinea.orden,
      })
      .from(reglaMapeoLinea)
      .innerJoin(cuenta, eq(cuenta.id, reglaMapeoLinea.cuentaId))
      .where(eq(reglaMapeoLinea.reglaId, rule.id))
      .orderBy(asc(reglaMapeoLinea.orden));

    const [gen] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(asiento)
      .innerJoin(periodoContable, eq(periodoContable.id, asiento.periodoId))
      .where(
        and(
          eq(asiento.reglaId, rule.id),
          eq(asiento.anulado, false),
          eq(periodoContable.estado, 'abierto')
        )
      );

    // `condicion` es jsonb (tipo `unknown`): no serializa, se expone tipada
    // como `condition` y se saca del spread.
    const { condicion, ...ruleRest } = rule;
    return {
      rule: { ...ruleRest, condition: (condicion ?? null) as RuleCondition },
      lines: lines.map((l) => ({
        ...l,
        fixedAmount: l.fixedAmount ? parseFloat(l.fixedAmount) : null,
      })),
      generatedOpenCount: gen?.n ?? 0,
    };
  });

/** Crea una regla de mapeo con sus líneas-plantilla. (US 3.1.1) */
export const createMappingRule = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      name: z.string().min(1),
      sourceModule: z.enum(['comprobante', 'recibo', 'movimiento_bancario']),
      ruleType: z.enum(['default', 'condicional']).default('default'),
      condition: z.any().optional(),
      priority: z.number().int().default(100),
      lines: z.array(mappingLineSchema).min(2),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);
    validateRuleLines(d.lines);
    await assertPostableAccounts(
      d.clientId,
      orgId,
      d.lines.map((l) => l.accountId)
    );

    const rule = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(reglaMapeo)
        .values({
          orgId,
          clienteId: d.clientId,
          nombre: d.name.trim(),
          modulo: d.sourceModule,
          tipo: d.ruleType,
          condicion:
            d.ruleType === 'condicional' ? (d.condition ?? null) : null,
          prioridad: d.priority,
          activa: true,
        })
        .returning();
      await tx.insert(reglaMapeoLinea).values(
        d.lines.map((l, i) => ({
          reglaId: r.id,
          cuentaId: l.accountId,
          lado: l.side,
          base: l.amountBasis,
          importeFijo:
            l.amountBasis === 'fijo' && l.fixedAmount != null
              ? String(l.fixedAmount)
              : null,
          descripcion: l.description?.trim() ? l.description.trim() : null,
          orden: i,
        }))
      );
      return r;
    });

    const { condicion, ...ruleRest } = rule;
    return { ...ruleRest, condition: (condicion ?? null) as RuleCondition };
  });

/** Edita una regla. No regenera asientos ya creados. (US 3.1.3) */
export const updateMappingRule = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      sourceModule: z.enum(['comprobante', 'recibo', 'movimiento_bancario']),
      ruleType: z.enum(['default', 'condicional']).default('default'),
      condition: z.any().optional(),
      priority: z.number().int().default(100),
      lines: z.array(mappingLineSchema).min(2),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const d = ctx.data;
    const rule = await loadMappingRuleForOrg(d.id, orgId);
    validateRuleLines(d.lines);
    await assertPostableAccounts(
      rule.clienteId,
      orgId,
      d.lines.map((l) => l.accountId)
    );

    await db.transaction(async (tx) => {
      await tx
        .update(reglaMapeo)
        .set({
          nombre: d.name.trim(),
          modulo: d.sourceModule,
          tipo: d.ruleType,
          condicion:
            d.ruleType === 'condicional' ? (d.condition ?? null) : null,
          prioridad: d.priority,
        })
        .where(eq(reglaMapeo.id, rule.id));
      await tx
        .delete(reglaMapeoLinea)
        .where(eq(reglaMapeoLinea.reglaId, rule.id));
      await tx.insert(reglaMapeoLinea).values(
        d.lines.map((l, i) => ({
          reglaId: rule.id,
          cuentaId: l.accountId,
          lado: l.side,
          base: l.amountBasis,
          importeFijo:
            l.amountBasis === 'fijo' && l.fixedAmount != null
              ? String(l.fixedAmount)
              : null,
          descripcion: l.description?.trim() ? l.description.trim() : null,
          orden: i,
        }))
      );
    });

    return { ok: true };
  });

/** Activa/desactiva una regla sin borrarla. (US 3.1.4) */
export const setMappingRuleActive = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const rule = await loadMappingRuleForOrg(ctx.data.id, orgId);
    await db
      .update(reglaMapeo)
      .set({ activa: ctx.data.isActive })
      .where(eq(reglaMapeo.id, rule.id));
    return { ok: true };
  });

/**
 * Copia las reglas de una empresa a otra (isActive=false). Resuelve las cuentas
 * por código en la empresa destino; salta reglas con cuentas que no existen allí. (US 3.1.5)
 */
export const importMappingRules = createServerFn({ method: 'POST' })
  .validator(
    z.object({ fromClientId: z.string().uuid(), toClientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { fromClientId, toClientId } = ctx.data;
    if (fromClientId === toClientId)
      throw new Error('Elegí dos empresas distintas');
    await ensureClientBelongsToOrg(fromClientId, orgId);
    await ensureClientBelongsToOrg(toClientId, orgId);

    const srcRules = await db
      .select()
      .from(reglaMapeo)
      .where(eq(reglaMapeo.clienteId, fromClientId))
      .orderBy(asc(reglaMapeo.prioridad));
    if (srcRules.length === 0) return { created: 0, skipped: [] as string[] };

    const srcLines = await db
      .select({
        ruleId: reglaMapeoLinea.reglaId,
        code: cuenta.codigo,
        side: reglaMapeoLinea.lado,
        amountBasis: reglaMapeoLinea.base,
        fixedAmount: reglaMapeoLinea.importeFijo,
        description: reglaMapeoLinea.descripcion,
        lineOrder: reglaMapeoLinea.orden,
      })
      .from(reglaMapeoLinea)
      .innerJoin(cuenta, eq(cuenta.id, reglaMapeoLinea.cuentaId))
      .where(
        inArray(
          reglaMapeoLinea.reglaId,
          srcRules.map((r) => r.id)
        )
      )
      .orderBy(asc(reglaMapeoLinea.orden));

    // Mapa código→id de cuentas visibles para la empresa destino.
    const targetAccts = await db
      .select({ id: cuenta.id, code: cuenta.codigo })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          sql`(${cuenta.alcance} = 'base' OR (${cuenta.alcance} = 'propia' AND ${cuenta.clienteId} = ${toClientId}))`
        )
      );
    const codeToId = new Map(targetAccts.map((a) => [a.code, a.id]));

    const linesByRule = new Map<string, typeof srcLines>();
    for (const l of srcLines) {
      const list = linesByRule.get(l.ruleId) ?? [];
      list.push(l);
      linesByRule.set(l.ruleId, list);
    }

    let created = 0;
    const skipped: string[] = [];
    for (const r of srcRules) {
      const lines = linesByRule.get(r.id) ?? [];
      const resolved = lines.map((l) => ({
        ...l,
        targetId: codeToId.get(l.code),
      }));
      if (lines.length < 2 || resolved.some((l) => !l.targetId)) {
        skipped.push(r.nombre);
        continue;
      }
      await db.transaction(async (tx) => {
        const [nr] = await tx
          .insert(reglaMapeo)
          .values({
            orgId,
            clienteId: toClientId,
            nombre: r.nombre,
            modulo: r.modulo,
            tipo: r.tipo,
            condicion: r.condicion,
            prioridad: r.prioridad,
            activa: false,
          })
          .returning();
        await tx.insert(reglaMapeoLinea).values(
          resolved.map((l, i) => ({
            reglaId: nr.id,
            cuentaId: l.targetId!,
            lado: l.side,
            base: l.amountBasis,
            importeFijo: l.fixedAmount,
            descripcion: l.description,
            orden: i,
          }))
        );
      });
      created++;
    }

    return { created, skipped };
  });

/* ════════════ Asientos automáticos desde facturas (US 3.2.x) ════════════ */

/** Cuenta de sistema pending_review (base, a nivel estudio). Lanza si falta. */
async function loadPendingReviewAccountId(orgId: string): Promise<string> {
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

/** Reglas de facturas activas de una empresa, con sus líneas, ordenadas por prioridad. */
async function loadActiveInvoiceRules(clientId: string): Promise<ReglaLike[]> {
  const rules = await db
    .select()
    .from(reglaMapeo)
    .where(
      and(
        eq(reglaMapeo.clienteId, clientId),
        eq(reglaMapeo.modulo, 'comprobante'),
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

/** Asiento auto vigente (no anulado) de una factura, si existe. */
async function findAutoEntryForInvoice(clientId: string, invoiceId: string) {
  const [row] = await db
    .select({
      id: asiento.id,
      number: asiento.numero,
      periodId: asiento.periodoId,
      isEditedPostGeneration: asiento.editadoPostGeneracion,
    })
    .from(asiento)
    .where(
      and(
        eq(asiento.clienteId, clientId),
        eq(asiento.origenTipo, 'comprobante'),
        eq(asiento.origenId, invoiceId),
        eq(asiento.anulado, false)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Datos del comprobante que necesita el motor de asientos. `fechaEmision` es
 * una columna `date`: Drizzle la devuelve como string `YYYY-MM-DD`.
 */
interface InvoiceRow {
  id: string;
  fechaEmision: string;
  direccion: 'emitido' | 'recibido';
  tipo: number;
  /** Letra del catálogo `comprobante_tipo` (A/B/C/M/…), la usan las reglas. */
  letra: string | null;
  contraparte: string | null;
  total: string;
  ivaTotal: string;
  otrosTributos: string;
}

/**
 * Inserta el asiento automático de una factura ya validada, dentro de una tx.
 * Calcula el número consecutivo del ejercicio. Devuelve el asiento creado.
 */
async function insertAutoInvoiceEntry(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    orgId: string;
    clientId: string;
    fyId: string;
    periodId: string;
    date: string;
    inv: InvoiceRow;
    ruleId: string | null;
    lines: LineaArmada[];
    usedPendingReview: boolean;
    reason: string | null;
    userId: string | null;
  }
) {
  const {
    orgId,
    clientId,
    fyId,
    periodId,
    date,
    inv,
    ruleId,
    lines,
    usedPendingReview,
    reason,
    userId,
  } = params;

  const [{ maxNum }] = await tx
    .select({
      maxNum: sql<number>`coalesce(max(${asiento.numero}),0)::int`,
    })
    .from(asiento)
    .where(and(eq(asiento.clienteId, clientId), eq(asiento.ejercicioId, fyId)));
  const number = (maxNum ?? 0) + 1;

  const label = inv.direccion === 'recibido' ? 'Compra' : 'Venta';
  const description =
    `${label} ${inv.letra ?? inv.tipo} — ${inv.contraparte ?? ''}`.trim();

  const [je] = await tx
    .insert(asiento)
    .values({
      orgId,
      clienteId: clientId,
      ejercicioId: fyId,
      periodoId: periodId,
      numero: number,
      fecha: date,
      descripcion: description,
      origenTipo: 'comprobante',
      origenId: inv.id,
      reglaId: ruleId,
      creadoPor: userId,
    })
    .returning();

  await tx.insert(asientoLinea).values(
    lines.map((l, i) => ({
      asientoId: je.id,
      cuentaId: l.cuentaId,
      debe: String(l.debe),
      haber: String(l.haber),
      descripcion: l.descripcion,
      orden: i,
    }))
  );

  await tx.insert(evento).values(
    accountingEvent({
      orgId,
      clientId,
      eventType: 'journal_entry_created',
      entityId: je.id,
      fiscalYearId: fyId,
      data: {
        entryId: je.id,
        number,
        auto: true,
        source: 'comprobante',
        invoiceId: inv.id,
        ruleId,
        pendingReview: usedPendingReview,
        reason,
      },
      userId,
    })
  );

  return je;
}

type PlanResult =
  | {
      ok: false;
      reason: 'non_positive' | 'no_fy' | 'cerrado' | 'invalid_accounts';
      detail?: string;
    }
  | {
      ok: true;
      fyId: string;
      periodId: string;
      date: string;
      ruleId: string | null;
      lines: LineaArmada[];
      usedPendingReview: boolean;
      reason: string | null;
    };

/** Decide (sin escribir) cómo se contabiliza una factura. Valida fecha, período y cuentas. */
async function planInvoiceEntry(
  inv: InvoiceRow,
  clientId: string,
  orgId: string,
  rules: ReglaLike[],
  prId: string
): Promise<PlanResult> {
  const amounts = calcularImportes(inv);
  if (amounts.total <= 0) return { ok: false, reason: 'non_positive' };

  let resolved;
  try {
    resolved = await resolvePeriodForDate(clientId, inv.fechaEmision);
  } catch {
    return { ok: false, reason: 'no_fy' };
  }
  if (resolved.period.estado === 'cerrado')
    return { ok: false, reason: 'cerrado' };

  const rule = seleccionarRegla(rules, inv);
  if (rule && rule.lineas.length > 0) {
    try {
      await assertPostableAccounts(
        clientId,
        orgId,
        rule.lineas.map((l) => l.cuentaId)
      );
    } catch (e) {
      return {
        ok: false,
        reason: 'invalid_accounts',
        detail: e instanceof Error ? e.message : undefined,
      };
    }
  }

  const built = armarLineas(rule, amounts, prId);
  return {
    ok: true,
    fyId: resolved.fy.id,
    periodId: resolved.period.id,
    date: resolved.date,
    ruleId: rule?.id ?? null,
    lines: built.lineas,
    usedPendingReview: built.usoPendienteRevision,
    reason: built.motivo,
  };
}

const INVOICE_SELECT = {
  id: comprobante.id,
  fechaEmision: comprobante.fechaEmision,
  direccion: comprobante.direccion,
  tipo: comprobante.tipo,
  letra: comprobanteTipo.letra,
  contraparte: contraparte.nombre,
  total: comprobante.total,
  ivaTotal: comprobante.ivaTotal,
  otrosTributos: comprobante.otrosTributos,
} as const;

/**
 * Previsualiza las facturas contabilizables de una empresa: para cada una indica
 * qué regla matchearía, si ya está contabilizada y el estado de su período. (US 3.2.1/3.2.2)
 */
export const getInvoicePostingPreview = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      direction: z.enum(['all', 'emitido', 'recibido']).default('all'),
      includePosted: z.boolean().default(false),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const fys = await db
      .select()
      .from(ejercicio)
      .where(eq(ejercicio.clienteId, clientId));
    if (fys.length === 0) return { hasFiscalYear: false, invoices: [] };

    // Las fechas de ejercicio son columnas `date` (strings YYYY-MM-DD): ordenan
    // lexicográficamente, así que el mínimo/máximo salen sin parsear.
    const minStart = fys.map((f) => f.fechaDesde).sort()[0];
    const maxEnd = fys
      .map((f) => f.fechaHasta)
      .sort()
      .at(-1)!;

    // Estado de períodos indexado por YYYY-MM (único por empresa, los ejercicios no se solapan).
    const periods = await db
      .select({
        periodo: periodoContable.periodo,
        status: periodoContable.estado,
      })
      .from(periodoContable)
      .where(eq(periodoContable.clienteId, clientId));
    const periodStatus = new Map(
      periods.map((p) => [p.periodo.slice(0, 7), p.status])
    );

    const invs = await db
      .select(INVOICE_SELECT)
      .from(comprobante)
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
      .where(
        and(
          eq(comprobante.clienteId, clientId),
          gte(comprobante.fechaEmision, minStart),
          lte(comprobante.fechaEmision, maxEnd)
        )
      )
      .orderBy(asc(comprobante.fechaEmision))
      .limit(2000);

    const rules = await loadActiveInvoiceRules(clientId);

    // Asientos auto vigentes de estas facturas.
    const invIds = invs.map((i) => i.id);
    const posted = new Map<
      string,
      { id: string; number: number; edited: boolean }
    >();
    if (invIds.length > 0) {
      const entries = await db
        .select({
          id: asiento.id,
          number: asiento.numero,
          sourceId: asiento.origenId,
          edited: asiento.editadoPostGeneracion,
        })
        .from(asiento)
        .where(
          and(
            eq(asiento.clienteId, clientId),
            eq(asiento.origenTipo, 'comprobante'),
            eq(asiento.anulado, false),
            inArray(asiento.origenId, invIds)
          )
        );
      for (const e of entries) {
        if (e.sourceId)
          posted.set(e.sourceId, {
            id: e.id,
            number: e.number,
            edited: e.edited,
          });
      }
    }

    const rows = invs.map((inv) => {
      const amounts = calcularImportes(inv);
      const rule = seleccionarRegla(rules, inv);
      const post = posted.get(inv.id) ?? null;
      const pStatus = periodStatus.get(inv.fechaEmision.slice(0, 7)) ?? null;
      return {
        id: inv.id,
        emitionDate: inv.fechaEmision,
        type: inv.letra ?? String(inv.tipo),
        direction: inv.direccion,
        counterparty: inv.contraparte ?? '',
        total: amounts.total,
        net: amounts.neto,
        vat: amounts.iva,
        otherTaxes: amounts.otrosTributos,
        ruleId: rule?.id ?? null,
        ruleName: rule?.nombre ?? null,
        willUsePendingReview: !rule || amounts.otrosTributos > 0.005,
        posted: !!post,
        entryId: post?.id ?? null,
        entryNumber: post?.number ?? null,
        entryEdited: post?.edited ?? false,
        periodStatus: pStatus,
      };
    });

    const filtered = rows.filter((r) => {
      if (ctx.data.direction !== 'all' && r.direction !== ctx.data.direction)
        return false;
      if (!ctx.data.includePosted && r.posted) return false;
      return true;
    });

    return { hasFiscalYear: true, invoices: filtered };
  });

/** Genera los asientos automáticos de las facturas seleccionadas. (US 3.2.1/3.2.2) */
export const generateInvoiceEntries = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      invoiceIds: z.array(z.string().uuid()).min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const prId = await loadPendingReviewAccountId(orgId);
    const rules = await loadActiveInvoiceRules(clientId);

    const invs = await db
      .select(INVOICE_SELECT)
      .from(comprobante)
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
      .where(
        and(
          eq(comprobante.clienteId, clientId),
          inArray(comprobante.id, ctx.data.invoiceIds)
        )
      );
    const byId = new Map(invs.map((i) => [i.id, i]));

    const summary = {
      created: 0,
      pendingReview: 0,
      skippedExists: 0,
      skippedNoFy: 0,
      skippedClosed: 0,
      skippedNonPositive: 0,
      errors: [] as { invoiceId: string; reason: string }[],
    };

    for (const id of ctx.data.invoiceIds) {
      const inv = byId.get(id);
      if (!inv) {
        summary.errors.push({
          invoiceId: id,
          reason: 'Factura no encontrada o de otra empresa',
        });
        continue;
      }
      if (await findAutoEntryForInvoice(clientId, id)) {
        summary.skippedExists++;
        continue;
      }
      const plan = await planInvoiceEntry(inv, clientId, orgId, rules, prId);
      if (!plan.ok) {
        if (plan.reason === 'non_positive') summary.skippedNonPositive++;
        else if (plan.reason === 'no_fy') summary.skippedNoFy++;
        else if (plan.reason === 'cerrado') summary.skippedClosed++;
        else
          summary.errors.push({
            invoiceId: id,
            reason: plan.detail ?? 'Cuentas inválidas en la regla',
          });
        continue;
      }
      await db.transaction(async (tx) => {
        await insertAutoInvoiceEntry(tx, {
          orgId,
          clientId,
          fyId: plan.fyId,
          periodId: plan.periodId,
          date: plan.date,
          inv,
          ruleId: plan.ruleId,
          lines: plan.lines,
          usedPendingReview: plan.usedPendingReview,
          reason: plan.reason,
          userId,
        });
      });
      summary.created++;
      if (plan.usedPendingReview) summary.pendingReview++;
    }

    return summary;
  });

/**
 * Regenera el asiento de una factura desde Contabilidad: anula el vigente y crea
 * uno nuevo con las reglas actuales. Si el asiento fue editado a mano, exige `force`.
 */
export const regenerateInvoiceEntry = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      invoiceId: z.string().uuid(),
      force: z.boolean().default(false),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId, invoiceId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const [inv] = await db
      .select(INVOICE_SELECT)
      .from(comprobante)
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
      .where(
        and(eq(comprobante.clienteId, clientId), eq(comprobante.id, invoiceId))
      )
      .limit(1);
    if (!inv) throw new Error('Factura no encontrada o de otra empresa');

    const existing = await findAutoEntryForInvoice(clientId, invoiceId);
    if (existing) {
      if (existing.isEditedPostGeneration && !ctx.data.force) {
        return {
          needsConfirmation: true as const,
          entryNumber: existing.number,
        };
      }
      const { period } = await loadPeriodForOrg(existing.periodId, orgId);
      if (period.estado === 'cerrado') {
        throw new Error(
          'No se puede regenerar: el asiento actual está en un período cerrado. Reabrí el período o hacé un ajuste manual'
        );
      }
    }

    const prId = await loadPendingReviewAccountId(orgId);
    const rules = await loadActiveInvoiceRules(clientId);
    const plan = await planInvoiceEntry(inv, clientId, orgId, rules, prId);
    if (!plan.ok) {
      const msgs: Record<string, string> = {
        non_positive:
          'El comprobante no tiene un total positivo (ej. nota de crédito)',
        no_fy: 'No hay un ejercicio que cubra la fecha del comprobante',
        closed: 'El período del comprobante está cerrado',
        invalid_accounts:
          plan.detail ?? 'La regla referencia cuentas inválidas',
      };
      throw new Error(msgs[plan.reason]);
    }

    const je = await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(asiento)
          .set({
            anulado: true,
            anuladoAt: sql`now()`,
            anuladoPor: userId,
            motivoAnulacion: 'Regenerado desde el comprobante',
          })
          .where(eq(asiento.id, existing.id));
        await tx.insert(evento).values(
          accountingEvent({
            orgId,
            clientId,
            fiscalYearId: plan.fyId,
            eventType: 'journal_entry_voided',
            entityId: existing.id,
            data: {
              entryId: existing.id,
              number: existing.number,
              auto: true,
              reason: 'Regenerado desde el comprobante',
            },
            userId,
          })
        );
      }
      return insertAutoInvoiceEntry(tx, {
        orgId,
        clientId,
        fyId: plan.fyId,
        periodId: plan.periodId,
        date: plan.date,
        inv,
        ruleId: plan.ruleId,
        lines: plan.lines,
        usedPendingReview: plan.usedPendingReview,
        reason: plan.reason,
        userId,
      });
    });

    return {
      needsConfirmation: false as const,
      entryId: je.id,
      number: je.numero,
    };
  });

/* ════════════════════════ Bienes de uso (US 4.1.x) ════════════════════════ */

interface AccountOpt {
  id: string;
  code: string;
  name: string;
}

/** Cuentas compatibles para cada rol de un bien de uso (activo / amort. acum. / gasto). */
export const getFixedAssetAccounts = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const accounts = await db
      .select()
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          sql`(${cuenta.alcance} = 'base' OR (${cuenta.alcance} = 'propia' AND ${cuenta.clienteId} = ${clientId}))`
        )
      )
      .orderBy(asc(cuenta.codigo));

    const overrides = await db
      .select()
      .from(clienteCuenta)
      .where(eq(clienteCuenta.clienteId, clientId));
    const ovMap = new Map(overrides.map((o) => [o.cuentaId, o]));

    const active = accounts.filter((a) => ovMap.get(a.id)?.activa ?? a.activa);
    const opt = (a: (typeof active)[number]): AccountOpt => ({
      id: a.id,
      code: a.codigo,
      name: ovMap.get(a.id)?.nombrePropio ?? a.nombre,
    });

    return {
      assetAccounts: active
        .filter((a) => a.rubro === 'bienes_uso' && a.saldoEsperado === 'deudor')
        .map(opt),
      accumAccounts: active
        .filter(
          (a) => a.rubro === 'bienes_uso' && a.saldoEsperado === 'acreedor'
        )
        .map(opt),
      expenseAccounts: active
        .filter(
          (a) =>
            a.rubro !== null &&
            (EXPENSE_ACCOUNT_GROUPS as readonly string[]).includes(a.rubro)
        )
        .map(opt),
    };
  });

/** Valida que las 3 cuentas del bien sean imputables, activas y del tipo correcto. */
async function assertFixedAssetAccounts(
  clientId: string,
  orgId: string,
  ids: {
    assetAccountId: string;
    accumDeprAccountId: string;
    deprExpenseAccountId: string;
  }
): Promise<void> {
  const all = [
    ids.assetAccountId,
    ids.accumDeprAccountId,
    ids.deprExpenseAccountId,
  ];
  await assertPostableAccounts(clientId, orgId, all);

  const rows = await db
    .select({
      id: cuenta.id,
      code: cuenta.codigo,
      group: cuenta.rubro,
      expected: cuenta.saldoEsperado,
    })
    .from(cuenta)
    .where(and(eq(cuenta.orgId, orgId), inArray(cuenta.id, all)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const asset = byId.get(ids.assetAccountId);
  if (asset?.group !== 'bienes_uso' || asset.expected !== 'deudor') {
    throw new Error(
      'La cuenta del activo debe ser un Bien de uso (saldo deudor), ej. "Rodados"'
    );
  }
  const accum = byId.get(ids.accumDeprAccountId);
  if (accum?.group !== 'bienes_uso' || accum.expected !== 'acreedor') {
    throw new Error(
      'La cuenta de amortización acumulada debe ser una regularizadora de Bienes de uso (saldo acreedor), ej. "(-) Amortización acumulada rodados"'
    );
  }
  const exp = byId.get(ids.deprExpenseAccountId);
  if (
    !exp?.group ||
    !(EXPENSE_ACCOUNT_GROUPS as readonly string[]).includes(exp.group)
  ) {
    throw new Error(
      'La cuenta de gasto de amortización debe ser un resultado negativo (gasto), ej. "Amortización bienes de uso"'
    );
  }
}

const fixedAssetInput = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1),
  category: z.enum([
    'rodados',
    'muebles_utiles',
    'equipos_computacion',
    'instalaciones',
    'inmuebles',
    'maquinarias',
    'otros',
  ]),
  assetAccountId: z.string().uuid(),
  accumDeprAccountId: z.string().uuid(),
  deprExpenseAccountId: z.string().uuid(),
  acquisitionDate: z.string(),
  originalValue: z.number().positive(),
  usefulLifeYears: z.number().int().positive(),
  residualValue: z.number().min(0).default(0),
});

/** Registra un bien de uso. (US 4.1.1) */
export const createFixedAsset = createServerFn({ method: 'POST' })
  .validator(fixedAssetInput)
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);

    if (d.residualValue >= d.originalValue) {
      throw new Error('El valor residual debe ser menor al valor de origen');
    }
    await assertFixedAssetAccounts(d.clientId, orgId, d);

    const [row] = await db
      .insert(bienDeUso)
      .values({
        orgId,
        clienteId: d.clientId,
        nombre: d.name,
        categoria: d.category,
        cuentaBienId: d.assetAccountId,
        cuentaAmortizacionAcumuladaId: d.accumDeprAccountId,
        cuentaAmortizacionGastoId: d.deprExpenseAccountId,
        fechaAlta: d.acquisitionDate,
        valorOrigen: String(d.originalValue),
        vidaUtilAnios: d.usefulLifeYears,
        valorResidual: String(d.residualValue),
        metodo: 'lineal',
        estado: 'activo',
        creadoPor: userId,
      })
      .returning();
    return row;
  });

export interface FixedAssetRow {
  id: string;
  name: string;
  category: string;
  status: 'activo' | 'vendido' | 'baja';
  acquisitionDate: string | Date;
  originalValue: number;
  usefulLifeYears: number;
  residualValue: number;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  assetAccount: string;
  accumDeprAccount: string;
  deprExpenseAccount: string;
  disposalDate: string | Date | null;
  disposalReason: string | null;
}

/** Lista bienes de uso con su amortización calculada a hoy. (US 4.1.2) */
export const listFixedAssets = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      category: z.string().optional(),
      status: z.enum(['activo', 'vendido', 'baja']).optional(),
    })
  )
  .handler(async (ctx): Promise<FixedAssetRow[]> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const assetAcc = alias(cuenta, 'asset_acc');
    const accumAcc = alias(cuenta, 'accum_acc');
    const expAcc = alias(cuenta, 'exp_acc');

    const conds = [eq(bienDeUso.clienteId, clientId)];
    if (ctx.data.status) conds.push(eq(bienDeUso.estado, ctx.data.status));
    if (ctx.data.category)
      conds.push(eq(bienDeUso.categoria, ctx.data.category as 'otros'));

    const rows = await db
      .select({
        fa: bienDeUso,
        assetName: assetAcc.nombre,
        assetCode: assetAcc.codigo,
        accumName: accumAcc.nombre,
        accumCode: accumAcc.codigo,
        expName: expAcc.nombre,
        expCode: expAcc.codigo,
      })
      .from(bienDeUso)
      .innerJoin(assetAcc, eq(assetAcc.id, bienDeUso.cuentaBienId))
      .innerJoin(
        accumAcc,
        eq(accumAcc.id, bienDeUso.cuentaAmortizacionAcumuladaId)
      )
      .innerJoin(expAcc, eq(expAcc.id, bienDeUso.cuentaAmortizacionGastoId))
      .where(and(...conds))
      .orderBy(asc(bienDeUso.categoria), asc(bienDeUso.nombre));

    const now = new Date();
    return rows.map((r): FixedAssetRow => {
      const snap = depreciationSnapshot(
        {
          acquisitionDate: r.fa.fechaAlta,
          originalValue: r.fa.valorOrigen,
          usefulLifeYears: r.fa.vidaUtilAnios,
          residualValue: r.fa.valorResidual,
          status: r.fa.estado,
          disposalDate: r.fa.fechaBaja,
        },
        now
      );
      return {
        id: r.fa.id,
        name: r.fa.nombre,
        category: r.fa.categoria,
        status: r.fa.estado,
        acquisitionDate: r.fa.fechaAlta,
        originalValue: parseFloat(r.fa.valorOrigen),
        usefulLifeYears: r.fa.vidaUtilAnios,
        residualValue: parseFloat(r.fa.valorResidual),
        monthlyDepreciation: snap.monthly,
        accumulatedDepreciation: snap.accumulated,
        bookValue: snap.bookValue,
        assetAccount: `${r.assetCode} · ${r.assetName}`,
        accumDeprAccount: `${r.accumCode} · ${r.accumName}`,
        deprExpenseAccount: `${r.expCode} · ${r.expName}`,
        disposalDate: r.fa.fechaBaja,
        disposalReason: r.fa.motivoBaja,
      };
    });
  });

/** Da de baja un bien (venta / desuso / destrucción). (US 4.1.3) */
export const disposeFixedAsset = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      disposalDate: z.string(),
      reason: z.enum(['venta', 'desuso', 'destruccion']),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Verificar pertenencia al estudio.
    const [row] = await db
      .select({ fa: bienDeUso })
      .from(bienDeUso)
      .where(and(eq(bienDeUso.id, ctx.data.id), eq(bienDeUso.orgId, orgId)))
      .limit(1);
    if (!row) throw new Error('Bien no encontrado o no autorizado');
    if (row.fa.estado !== 'activo')
      throw new Error('El bien ya está dado de baja');

    const disposalDate = ctx.data.disposalDate;
    if (disposalDate < row.fa.fechaAlta) {
      throw new Error(
        'La fecha de baja no puede ser anterior a la de adquisición'
      );
    }

    await db
      .update(bienDeUso)
      .set({
        estado: ctx.data.reason === 'venta' ? 'vendido' : 'baja',
        fechaBaja: disposalDate,
        motivoBaja: ctx.data.reason,
      })
      .where(eq(bienDeUso.id, ctx.data.id));
    return { ok: true };
  });

/* ═══════════════ Membrete EECC · datos fiscales + firma contador ═══════════════ */

export interface AccountantSignatureData {
  nombre: string;
  titulo: string;
  universidad: string;
  consejo: string;
  tomo: string;
  folio: string;
  firmaImagen: string | null;
}

export interface MembreteData {
  empresaName: string;
  cuit: string;
  domicilio: string;
  actividadPrincipal: string;
  /** Columna `date`: string `YYYY-MM-DD`. */
  fechaInscripcion: string | null;
  numeroInscripcion: string;
  accountant: AccountantSignatureData | null;
}

/** Datos de la empresa + firma del contador para el membrete de los EECC. */
export const getMembreteData = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx): Promise<MembreteData> => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // Los datos de inscripción viven en `cliente_eecc_config`, no en `cliente`:
    // son configuración del módulo de balances, no identidad fiscal.
    const [c] = await db
      .select({
        name: cliente.razonSocial,
        identityNumber: cliente.cuit,
        address: cliente.domicilio,
        actividadPrincipal: clienteEeccConfig.actividadPrincipal,
        fechaInscripcion: clienteEeccConfig.fechaInscripcionRpc,
        numeroInscripcion: clienteEeccConfig.numeroIgj,
      })
      .from(cliente)
      .leftJoin(clienteEeccConfig, eq(clienteEeccConfig.clienteId, cliente.id))
      .where(eq(cliente.id, ctx.data.clientId))
      .limit(1);

    const sig = await loadFirmante(orgId);

    return {
      empresaName: c?.name ?? '',
      cuit: c?.identityNumber ?? '',
      domicilio: c?.address ?? '',
      actividadPrincipal: c?.actividadPrincipal ?? '',
      fechaInscripcion: c?.fechaInscripcion ?? null,
      numeroInscripcion: c?.numeroInscripcion ?? '',
      accountant: sig,
    };
  });

/** Firmante del estudio + URL firmada de su imagen de firma (vive en R2). */
async function loadFirmante(
  orgId: string
): Promise<AccountantSignatureData | null> {
  const [sig] = await db
    .select()
    .from(firmante)
    .where(and(eq(firmante.orgId, orgId), eq(firmante.activo, true)))
    .orderBy(asc(firmante.createdAt))
    .limit(1);
  if (!sig) return null;
  return {
    nombre: sig.nombre ?? '',
    titulo: sig.titulo ?? 'Contador Público',
    universidad: sig.universidad ?? '',
    consejo: sig.consejo ?? '',
    tomo: sig.tomo ?? '',
    folio: sig.folio ?? '',
    firmaImagen: sig.firmaImagenKey
      ? r2Storage.presign(sig.firmaImagenKey, 3600)
      : null,
  };
}

/** Firma del contador del estudio (nivel organización). */
export const getAccountantSignature = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountantSignatureData | null> => {
    const { orgId } = await getSessionWithOrg();
    return loadFirmante(orgId);
  }
);

export const saveAccountantSignature = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      nombre: z.string().max(200).optional().default(''),
      titulo: z.string().max(120).optional().default('Contador Público'),
      universidad: z.string().max(120).optional().default(''),
      consejo: z.string().max(120).optional().default(''),
      tomo: z.string().max(40).optional().default(''),
      folio: z.string().max(40).optional().default(''),
      firmaImagen: z.string().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    // `firmante` admite N por estudio; la UI maneja uno solo, así que se
    // actualiza el primero activo y se crea si todavía no existe.
    const [existing] = await db
      .select({ id: firmante.id })
      .from(firmante)
      .where(and(eq(firmante.orgId, orgId), eq(firmante.activo, true)))
      .orderBy(asc(firmante.createdAt))
      .limit(1);

    const datos = {
      nombre: ctx.data.nombre || '',
      titulo: ctx.data.titulo || 'Contador Público',
      universidad: ctx.data.universidad || null,
      consejo: ctx.data.consejo || null,
      tomo: ctx.data.tomo || null,
      folio: ctx.data.folio || null,
    };

    const firmanteId =
      existing?.id ??
      (
        await db
          .insert(firmante)
          .values({ orgId, ...datos })
          .returning({ id: firmante.id })
      )[0].id;

    // La firma va a R2; en la DB queda la key, nunca el base64.
    let firmaImagenKey: string | null | undefined;
    if (ctx.data.firmaImagen !== undefined) {
      firmaImagenKey = null;
      if (ctx.data.firmaImagen) {
        const dataUrl = ctx.data.firmaImagen;
        const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
        firmaImagenKey = r2Storage.firmaContadorKey(
          orgId,
          firmanteId,
          r2Storage.extensionFor(null, mimeType)
        );
        await r2Storage.upload(
          firmaImagenKey,
          Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
          mimeType
        );
      }
    }

    await db
      .update(firmante)
      .set({
        ...datos,
        ...(firmaImagenKey !== undefined ? { firmaImagenKey } : {}),
      })
      .where(eq(firmante.id, firmanteId));
    return { ok: true };
  });

/** Actualiza los datos fiscales de la empresa usados en el membrete de los EECC. */
export const updateClientFiscalData = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      address: z.string().max(300).optional(),
      actividadPrincipal: z.string().max(300).nullable().optional(),
      fechaInscripcion: z.string().nullable().optional(), // YYYY-MM-DD
      numeroInscripcion: z.string().max(60).nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // El domicilio es identidad fiscal (vive en `cliente`); los datos de
    // inscripción son configuración de balances (`cliente_eecc_config`).
    if (ctx.data.address !== undefined) {
      await db
        .update(cliente)
        .set({ domicilio: ctx.data.address })
        .where(eq(cliente.id, ctx.data.clientId));
    }

    const eeccSet: Partial<typeof clienteEeccConfig.$inferInsert> = {};
    if (ctx.data.actividadPrincipal !== undefined)
      eeccSet.actividadPrincipal = ctx.data.actividadPrincipal || null;
    if (ctx.data.numeroInscripcion !== undefined)
      eeccSet.numeroIgj = ctx.data.numeroInscripcion || null;
    if (ctx.data.fechaInscripcion !== undefined)
      eeccSet.fechaInscripcionRpc = ctx.data.fechaInscripcion || null;

    if (Object.keys(eeccSet).length > 0) {
      await db
        .insert(clienteEeccConfig)
        .values({ clienteId: ctx.data.clientId, ...eeccSet })
        .onConflictDoUpdate({
          target: clienteEeccConfig.clienteId,
          set: eeccSet,
        });
    }
    return { ok: true };
  });

/* ════════════════════════ Anexo I (US 4.2.x) ════════════════════════ */

export interface AnexoIAssetRow {
  id: string;
  name: string;
  // Movimiento de valores de origen
  valorInicio: number; // valor al inicio del ejercicio
  altas: number; // altas del ejercicio
  bajas: number; // bajas del ejercicio (a valor de origen)
  valorCierre: number; // valor al cierre = inicio + altas − bajas
  // Amortizaciones
  accumStart: number; // acumuladas al inicio
  amortBajas: number; // amortización acumulada dada de baja en el ejercicio
  rate: number; // % de amortización del ejercicio (100 / vida útil)
  amortYear: number; // amortización del ejercicio (monto)
  accumEnd: number; // acumuladas al cierre = inicio − bajas + del ejercicio
  residualEnd: number; // neto al cierre = valor cierre − acumuladas al cierre
  disposed: boolean;
}
export interface AnexoICategory {
  category: string;
  assets: AnexoIAssetRow[];
  totals: {
    valorInicio: number;
    altas: number;
    bajas: number;
    valorCierre: number;
    accumStart: number;
    amortBajas: number;
    amortYear: number;
    accumEnd: number;
    residualEnd: number;
  };
}
export interface AnexoISuggestionLine {
  accountId: string;
  code: string;
  name: string;
  side: 'debe' | 'haber';
  amount: number;
}

const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
/** Día anterior a `d` (columna `date`, string `YYYY-MM-DD`). */
const endOfMonthBefore = (d: string): string =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

interface AnexoIAssetFull extends AnexoIAssetRow {
  category: string;
  assetAccountId: string;
  assetAccountLabel: string;
  accumAccountId: string;
  accumAccountLabel: string;
  expenseAccountId: string;
  expenseAccountLabel: string;
}

/** Computa las filas del Anexo I de una empresa para un ejercicio dado. */
async function computeAnexoIRows(
  clientId: string,
  fy: FiscalYearRow
): Promise<AnexoIAssetFull[]> {
  const assetAcc = alias(cuenta, 'anexo_asset');
  const accumAcc = alias(cuenta, 'anexo_accum');
  const expAcc = alias(cuenta, 'anexo_exp');

  const rows = await db
    .select({
      fa: bienDeUso,
      assetCode: assetAcc.codigo,
      assetName: assetAcc.nombre,
      accumCode: accumAcc.codigo,
      accumName: accumAcc.nombre,
      expCode: expAcc.codigo,
      expName: expAcc.nombre,
    })
    .from(bienDeUso)
    .innerJoin(assetAcc, eq(assetAcc.id, bienDeUso.cuentaBienId))
    .innerJoin(
      accumAcc,
      eq(accumAcc.id, bienDeUso.cuentaAmortizacionAcumuladaId)
    )
    .innerJoin(expAcc, eq(expAcc.id, bienDeUso.cuentaAmortizacionGastoId))
    .where(
      and(
        eq(bienDeUso.clienteId, clientId),
        lte(bienDeUso.fechaAlta, fy.fechaHasta),
        or(isNull(bienDeUso.fechaBaja), gte(bienDeUso.fechaBaja, fy.fechaDesde))
      )
    )
    .orderBy(asc(bienDeUso.categoria), asc(bienDeUso.nombre));

  const startRef = endOfMonthBefore(fy.fechaDesde);

  return rows.map((r): AnexoIAssetFull => {
    const a = {
      acquisitionDate: r.fa.fechaAlta,
      originalValue: r.fa.valorOrigen,
      usefulLifeYears: r.fa.vidaUtilAnios,
      residualValue: r.fa.valorResidual,
      status: r.fa.estado,
      disposalDate: r.fa.fechaBaja,
    };
    const accumStart = accumulatedDepreciation(a, startRef);
    // Amortización acumulada devengada hasta el cierre (tope en la baja, si aplica).
    const accumEndRaw = accumulatedDepreciation(a, fy.fechaHasta);
    const originalValue = parseFloat(r.fa.valorOrigen);
    const disposed = r.fa.estado !== 'activo';

    // Fechas `date`: son strings ISO, se comparan lexicográficamente.
    // Altas: bien incorporado dentro del ejercicio (el query ya garantiza
    // fechaAlta <= fy.fechaHasta).
    const isAlta = r.fa.fechaAlta >= fy.fechaDesde;
    // Bajas: bien dado de baja dentro del ejercicio.
    const isBaja =
      disposed &&
      r.fa.fechaBaja != null &&
      r.fa.fechaBaja >= fy.fechaDesde &&
      r.fa.fechaBaja <= fy.fechaHasta;

    const valorInicio = isAlta ? 0 : originalValue;
    const altas = isAlta ? originalValue : 0;
    const bajas = isBaja ? originalValue : 0;
    const valorCierre = r2(valorInicio + altas - bajas);

    // Amortización del ejercicio = devengado del período (hasta el cierre o la baja).
    const amortYear = r2(accumEndRaw - accumStart);
    // Amortización acumulada que se da de baja junto con el bien.
    const amortBajas = isBaja ? accumEndRaw : 0;
    // Acumulada al cierre: inicio + del ejercicio − dada de baja.
    const accumEnd = r2(accumStart + amortYear - amortBajas);
    const residualEnd = r2(valorCierre - accumEnd);
    const rate = r.fa.vidaUtilAnios > 0 ? r2(100 / r.fa.vidaUtilAnios) : 0;

    return {
      id: r.fa.id,
      name: r.fa.nombre,
      category: r.fa.categoria,
      valorInicio,
      altas,
      bajas,
      valorCierre,
      accumStart,
      amortBajas,
      rate,
      amortYear,
      accumEnd,
      residualEnd,
      disposed,
      assetAccountId: r.fa.cuentaBienId,
      assetAccountLabel: `${r.assetCode} · ${r.assetName}`,
      accumAccountId: r.fa.cuentaAmortizacionAcumuladaId,
      accumAccountLabel: `${r.accumCode} · ${r.accumName}`,
      expenseAccountId: r.fa.cuentaAmortizacionGastoId,
      expenseAccountLabel: `${r.expCode} · ${r.expName}`,
    };
  });
}

const emptyTotals = () => ({
  valorInicio: 0,
  altas: 0,
  bajas: 0,
  valorCierre: 0,
  accumStart: 0,
  amortBajas: 0,
  amortYear: 0,
  accumEnd: 0,
  residualEnd: 0,
});

/** Agrupa filas por categoría con totales. */
function groupAnexoI(rows: AnexoIAssetFull[]): {
  categories: AnexoICategory[];
  grandTotals: ReturnType<typeof emptyTotals>;
} {
  const byCat = new Map<string, AnexoICategory>();
  const grand = emptyTotals();
  for (const row of rows) {
    let cat = byCat.get(row.category);
    if (!cat) {
      cat = { category: row.category, assets: [], totals: emptyTotals() };
      byCat.set(row.category, cat);
    }
    cat.assets.push({
      id: row.id,
      name: row.name,
      valorInicio: row.valorInicio,
      altas: row.altas,
      bajas: row.bajas,
      valorCierre: row.valorCierre,
      accumStart: row.accumStart,
      amortBajas: row.amortBajas,
      rate: row.rate,
      amortYear: row.amortYear,
      accumEnd: row.accumEnd,
      residualEnd: row.residualEnd,
      disposed: row.disposed,
    });
    for (const k of Object.keys(grand) as (keyof typeof grand)[]) {
      cat.totals[k] = r2(cat.totals[k] + row[k]);
      grand[k] = r2(grand[k] + row[k]);
    }
  }
  return { categories: [...byCat.values()], grandTotals: grand };
}

/** Anexo I del ejercicio + sugerencia de asiento de amortización. (US 4.2.x) */
export const getAnexoI = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const rows = await computeAnexoIRows(clientId, fy);
    const { categories, grandTotals } = groupAnexoI(rows);

    // Sugerencia de asiento de amortización: Debe por cuenta de gasto, Haber por
    // cuenta de amortización acumulada, sumando la amortización del ejercicio.
    const debitMap = new Map<string, AnexoISuggestionLine>();
    const creditMap = new Map<string, AnexoISuggestionLine>();
    for (const row of rows) {
      if (row.amortYear <= 0) continue;
      const d = debitMap.get(row.expenseAccountId) ?? {
        accountId: row.expenseAccountId,
        code: row.expenseAccountLabel.split(' · ')[0],
        name: row.expenseAccountLabel.split(' · ').slice(1).join(' · '),
        side: 'debe' as const,
        amount: 0,
      };
      d.amount = r2(d.amount + row.amortYear);
      debitMap.set(row.expenseAccountId, d);

      const c = creditMap.get(row.accumAccountId) ?? {
        accountId: row.accumAccountId,
        code: row.accumAccountLabel.split(' · ')[0],
        name: row.accumAccountLabel.split(' · ').slice(1).join(' · '),
        side: 'haber' as const,
        amount: 0,
      };
      c.amount = r2(c.amount + row.amortYear);
      creditMap.set(row.accumAccountId, c);
    }
    const suggestionLines = [...debitMap.values(), ...creditMap.values()];

    // Comparativo con el ejercicio anterior (número - 1), si existe.
    let prior: {
      number: number;
      grandTotals: ReturnType<typeof emptyTotals>;
    } | null = null;
    const [priorFy] = await db
      .select()
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          eq(ejercicio.numero, fy.numero - 1)
        )
      )
      .limit(1);
    if (priorFy) {
      const priorRows = await computeAnexoIRows(clientId, priorFy);
      prior = {
        number: priorFy.numero,
        grandTotals: groupAnexoI(priorRows).grandTotals,
      };
    }

    return {
      ejercicio: {
        number: fy.numero,
        startDate: fy.fechaDesde,
        endDate: fy.fechaHasta,
        status: fy.estado,
      },
      categories,
      grandTotals,
      suggestion: {
        lines: suggestionLines,
        total: r2(grandTotals.amortYear),
      },
      prior,
    };
  });

/* ════════════════════ Cierre de ejercicio — checklist (US 5.1.1) ════════════════════ */

export interface YearEndCheck {
  key: 'periods' | 'pending_review' | 'balance' | 'rules';
  label: string;
  status: 'pass' | 'fail';
  detail: string;
}
export interface YearEndChecklist {
  fiscalYearNumber: number;
  fiscalYearStatus: 'abierto' | 'en_cierre' | 'cerrado';
  canClose: boolean;
  checks: YearEndCheck[];
}

/**
 * Valida las precondiciones para cerrar el ejercicio: 12 períodos cerrados, sin
 * asientos en pending_review, balance cuadrado, y reglas de mapeo consistentes. (US 5.1.1)
 */
export const getYearEndChecklist = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
    })
  )
  .handler(async (ctx): Promise<YearEndChecklist> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const checks: YearEndCheck[] = [];

    // 1) Todos los períodos cerrados.
    const periods = await db
      .select({
        periodo: periodoContable.periodo,
        status: periodoContable.estado,
      })
      .from(periodoContable)
      .where(eq(periodoContable.ejercicioId, fy.id))
      .orderBy(asc(periodoContable.periodo));
    const open = periods.filter((p) => p.status !== 'cerrado');
    checks.push({
      key: 'periods',
      label: 'Los 12 períodos del ejercicio están cerrados',
      status: open.length === 0 ? 'pass' : 'fail',
      detail:
        open.length === 0
          ? `${periods.length} de ${periods.length} períodos cerrados`
          : `Faltan cerrar: ${open.map((p) => MONTH_NAMES[periodoMonth(p.periodo)]).join(', ')}`,
    });

    // 2) Sin asientos en pendiente de revisión.
    const [{ pend }] = await db
      .select({ pend: sql<number>`count(distinct ${asiento.id})::int` })
      .from(asiento)
      .innerJoin(asientoLinea, eq(asientoLinea.asientoId, asiento.id))
      .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
      .where(
        and(
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          eq(cuenta.orgId, orgId),
          eq(cuenta.codigo, PENDING_REVIEW_CODE)
        )
      );
    checks.push({
      key: 'pending_review',
      label: 'No hay asientos en pendiente de revisión',
      status: (pend ?? 0) === 0 ? 'pass' : 'fail',
      detail:
        (pend ?? 0) === 0
          ? 'Sin pendientes'
          : `Hay ${pend} asiento(s) en pendiente de revisión — resolvelos en la bandeja Pendientes`,
    });

    // 3) Balance cuadrado (suma Debe = suma Haber del ejercicio).
    const [bal] = await db
      .select({
        debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(and(eq(asiento.ejercicioId, fy.id), eq(asiento.anulado, false)));
    const totalDebit = parseFloat(bal?.debit ?? '0');
    const totalCredit = parseFloat(bal?.credit ?? '0');
    const diff = r2(totalDebit - totalCredit);
    checks.push({
      key: 'balance',
      label: 'El ejercicio balancea (Debe = Haber)',
      status: Math.abs(diff) < 0.005 ? 'pass' : 'fail',
      detail:
        Math.abs(diff) < 0.005
          ? `Debe = Haber = $ ${totalDebit.toFixed(2)}`
          : `Diferencia de $ ${diff.toFixed(2)} entre Debe y Haber`,
    });

    // 4) Reglas de mapeo activas con condiciones consistentes.
    const rules = await db
      .select({
        name: reglaMapeo.nombre,
        ruleType: reglaMapeo.tipo,
        condition: reglaMapeo.condicion,
      })
      .from(reglaMapeo)
      .where(
        and(eq(reglaMapeo.clienteId, clientId), eq(reglaMapeo.activa, true))
      );
    // Mismo vocabulario que `reglaMatchea()`: una sola clave desconocida hace
    // que la regla no matchee nunca, así que alcanza con que sobre una.
    const SUPPORTED_KEYS = ['direccion', 'letra'];
    const badRules = rules.filter((r) => {
      if (r.ruleType !== 'condicional') return false;
      const cond = r.condition as Record<string, unknown> | null;
      if (!cond || typeof cond !== 'object' || Object.keys(cond).length === 0)
        return true;
      const keys = Object.keys(cond).map((k) => k.toLowerCase());
      return !keys.every((k) => SUPPORTED_KEYS.includes(k));
    });
    checks.push({
      key: 'rules',
      label: 'Reglas de mapeo con condiciones consistentes',
      status: badRules.length === 0 ? 'pass' : 'fail',
      detail:
        badRules.length === 0
          ? 'Sin reglas inconsistentes'
          : `Reglas con condición inválida: ${badRules.map((r) => r.name).join(', ')}`,
    });

    return {
      fiscalYearNumber: fy.numero,
      fiscalYearStatus: fy.estado,
      canClose:
        fy.estado === 'abierto' && checks.every((c) => c.status === 'pass'),
      checks,
    };
  });

/* ════════════════ Cierre de ejercicio — ejecución (US 5.2.x) ════════════════ */

interface FyAccountBalance {
  accountId: string;
  code: string;
  name: string;
  group: string | null;
  saldo: number; // debe − haber (>0 deudor, <0 acreedor)
}

/** Saldos por cuenta de un ejercicio (suma de todos sus asientos no anulados). */
async function computeFyBalances(
  orgId: string,
  fyId: string
): Promise<FyAccountBalance[]> {
  const rows = await db
    .select({
      accountId: cuenta.id,
      code: cuenta.codigo,
      name: cuenta.nombre,
      group: cuenta.rubro,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
    .where(
      and(
        eq(asiento.ejercicioId, fyId),
        eq(asiento.anulado, false),
        eq(cuenta.orgId, orgId)
      )
    )
    .groupBy(cuenta.id, cuenta.codigo, cuenta.nombre, cuenta.rubro);

  return rows
    .map((r) => ({
      accountId: r.accountId,
      code: r.code,
      name: r.name,
      group: r.group,
      saldo: r2(parseFloat(r.debit) - parseFloat(r.credit)),
    }))
    .filter((r) => Math.abs(r.saldo) > 0.005);
}

export interface ClosingLine {
  accountId: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
}
export interface ClosingEntryPreview {
  lines: ClosingLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

interface ResultadoAccount {
  id: string;
  code: string;
  name: string;
}

/** Construye los asientos de refundición y cierre patrimonial a partir de los saldos. */
function buildClosingEntries(
  balances: FyAccountBalance[],
  resultado: ResultadoAccount
): {
  refundicion: ClosingEntryPreview;
  cierre: ClosingEntryPreview;
  apertura: ClosingEntryPreview;
  net: number; // >0 ganancia, <0 pérdida
} {
  const RESULT = new Set<string>(RESULT_ACCOUNT_GROUPS);
  const resultAccts = balances.filter((b) => b.group && RESULT.has(b.group));
  const patrimonial = balances.filter((b) => !b.group || !RESULT.has(b.group));

  // ── Refundición: lleva cada cuenta de resultado a cero contra Resultado del ejercicio.
  const refLines: ClosingLine[] = [];
  let net = 0; // ingresos − gastos
  for (const a of resultAccts) {
    if (a.saldo > 0) {
      // saldo deudor (gasto/costo) → al Haber para cancelar
      refLines.push({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        debit: 0,
        credit: a.saldo,
      });
      net -= a.saldo;
    } else {
      // saldo acreedor (ingreso) → al Debe para cancelar
      refLines.push({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        debit: -a.saldo,
        credit: 0,
      });
      net += -a.saldo;
    }
  }
  const netR = r2(net);
  if (Math.abs(netR) > 0.005) {
    // Resultado del ejercicio: ganancia → Haber (PN aumenta); pérdida → Debe.
    refLines.push({
      accountId: resultado.id,
      code: resultado.code,
      name: resultado.name,
      debit: netR < 0 ? -netR : 0,
      credit: netR > 0 ? netR : 0,
    });
  }

  // ── Cierre patrimonial: saldos patrimoniales + el Resultado del ejercicio ya refundido.
  const cierreBalances = patrimonial.map((b) => ({ ...b }));
  const idx = cierreBalances.findIndex((b) => b.accountId === resultado.id);
  if (idx >= 0) {
    cierreBalances[idx].saldo = r2(cierreBalances[idx].saldo - netR);
  } else if (Math.abs(netR) > 0.005) {
    cierreBalances.push({
      accountId: resultado.id,
      code: resultado.code,
      name: resultado.name,
      group: RESULT_TARGET_GROUP,
      saldo: r2(-netR), // ganancia → acreedor
    });
  }

  const cierreLines: ClosingLine[] = [];
  const aperturaLines: ClosingLine[] = [];
  for (const b of cierreBalances) {
    if (Math.abs(b.saldo) < 0.005) continue;
    if (b.saldo > 0) {
      // deudor (activo) → cierre lo lleva al Haber; apertura lo reabre al Debe
      cierreLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: 0,
        credit: b.saldo,
      });
      aperturaLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: b.saldo,
        credit: 0,
      });
    } else {
      cierreLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: -b.saldo,
        credit: 0,
      });
      aperturaLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: 0,
        credit: -b.saldo,
      });
    }
  }

  const summarize = (lines: ClosingLine[]): ClosingEntryPreview => {
    const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
    return {
      lines,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.005,
    };
  };

  return {
    refundicion: summarize(refLines),
    cierre: summarize(cierreLines),
    apertura: summarize(aperturaLines),
    net: netR,
  };
}

/** Cuenta de sistema "Resultado del ejercicio". */
async function loadResultadoAccount(orgId: string): Promise<ResultadoAccount> {
  const [acc] = await db
    .select({ id: cuenta.id, code: cuenta.codigo, name: cuenta.nombre })
    .from(cuenta)
    .where(
      and(
        eq(cuenta.orgId, orgId),
        eq(cuenta.alcance, 'base'),
        eq(cuenta.rubro, RESULT_TARGET_GROUP),
        eq(cuenta.esCuentaSistema, true)
      )
    )
    .limit(1);
  if (!acc) {
    throw new Error(
      'Falta la cuenta de sistema "Resultado del ejercicio". Re-sembrá el plan base'
    );
  }
  return acc;
}

/** Fechas del ejercicio siguiente. Todo en strings `YYYY-MM-DD` (columnas `date`). */
const nextFyDates = (end: string): { start: string; end: string } => {
  const startD = new Date(new Date(`${end}T00:00:00Z`).getTime() + 86400000);
  const sY = startD.getUTCFullYear();
  const sM = startD.getUTCMonth();
  return {
    start: startD.toISOString().slice(0, 10),
    end: new Date(Date.UTC(sY, sM + 12, 0)).toISOString().slice(0, 10),
  };
};

/** Líneas (cuenta + montos) de un asiento ya posteado, para el preview del wizard. */
async function loadEntryClosingLines(entryId: string): Promise<ClosingLine[]> {
  const ls = await db
    .select({
      accountId: asientoLinea.cuentaId,
      code: cuenta.codigo,
      name: cuenta.nombre,
      debit: asientoLinea.debe,
      credit: asientoLinea.haber,
    })
    .from(asientoLinea)
    .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
    .where(eq(asientoLinea.asientoId, entryId))
    .orderBy(asc(asientoLinea.orden));
  return ls.map((l) => ({
    accountId: l.accountId,
    code: l.code,
    name: l.name,
    debit: parseFloat(l.debit),
    credit: parseFloat(l.credit),
  }));
}

const summarizeLines = (lines: ClosingLine[]): ClosingEntryPreview => {
  const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  return {
    lines,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.005,
  };
};

export interface ClosingStageView {
  status: 'done' | 'pending';
  entryNumber: number | null;
  preview: ClosingEntryPreview | null;
}
export interface ClosingWizardState {
  fiscalYearNumber: number;
  fiscalYearStatus: 'abierto' | 'en_cierre' | 'cerrado';
  resultado: {
    cuenta: string;
    net: number;
    tipo: 'ganancia' | 'perdida' | 'neutro';
  };
  refundicion: ClosingStageView;
  cierre: ClosingStageView;
  apertura: ClosingStageView & {
    nextFy: { number: number; startDate: string; endDate: string } | null;
  };
}

/** Estado del wizard de cierre por etapa (con previews editables). (US 5.3.x) */
export const getClosingWizard = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx): Promise<ClosingWizardState> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    const resultado = await loadResultadoAccount(orgId);

    // Asientos de cierre ya posteados (refundición = el de menor número, cierre = el siguiente).
    const closingEntries = await db
      .select({
        id: asiento.id,
        number: asiento.numero,
        description: asiento.descripcion,
      })
      .from(asiento)
      .where(
        and(
          eq(asiento.clienteId, clientId),
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.origenTipo, 'cierre'),
          eq(asiento.anulado, false)
        )
      )
      .orderBy(asc(asiento.numero));
    const refEntry = closingEntries[0] ?? null;
    const cierreEntry = closingEntries[1] ?? null;

    // Asiento de apertura (en el próximo ejercicio).
    const [nextFy] = await db
      .select()
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          eq(ejercicio.numero, fy.numero + 1)
        )
      )
      .limit(1);
    let aperturaEntry: { number: number } | null = null;
    if (nextFy) {
      const [op] = await db
        .select({ number: asiento.numero })
        .from(asiento)
        .where(
          and(
            eq(asiento.ejercicioId, nextFy.id),
            eq(asiento.origenTipo, 'apertura'),
            eq(asiento.anulado, false)
          )
        )
        .limit(1);
      aperturaEntry = op ?? null;
    }

    const balances = await computeFyBalances(orgId, fy.id);
    const built = buildClosingEntries(balances, resultado);

    // Resultado del ejercicio (ganancia/pérdida) para mostrar.
    const resultadoBal = balances.find((b) => b.accountId === resultado.id);
    const net = refEntry ? r2(-(resultadoBal?.saldo ?? 0)) : built.net;

    // Preview de apertura: si el cierre está posteado, invertir sus líneas.
    let aperturaPreview: ClosingEntryPreview;
    if (cierreEntry) {
      const cl = await loadEntryClosingLines(cierreEntry.id);
      aperturaPreview = summarizeLines(
        cl.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))
      );
    } else {
      aperturaPreview = built.apertura;
    }

    const nd = nextFyDates(fy.fechaHasta);

    return {
      fiscalYearNumber: fy.numero,
      fiscalYearStatus: fy.estado,
      resultado: {
        cuenta: `${resultado.code} · ${resultado.name}`,
        net,
        tipo: net > 0.005 ? 'ganancia' : net < -0.005 ? 'perdida' : 'neutro',
      },
      refundicion: {
        status: refEntry ? 'done' : 'pending',
        entryNumber: refEntry?.number ?? null,
        preview: refEntry
          ? summarizeLines(await loadEntryClosingLines(refEntry.id))
          : built.refundicion,
      },
      cierre: {
        status: cierreEntry ? 'done' : 'pending',
        entryNumber: cierreEntry?.number ?? null,
        preview: cierreEntry
          ? summarizeLines(await loadEntryClosingLines(cierreEntry.id))
          : built.cierre,
      },
      apertura: {
        status: aperturaEntry ? 'done' : 'pending',
        entryNumber: aperturaEntry?.number ?? null,
        preview: aperturaEntry ? null : aperturaPreview,
        nextFy: {
          number: fy.numero + 1,
          startDate: nd.start,
          endDate: nd.end,
        },
      },
    };
  });

const closingLineInput = z.object({
  accountId: z.string().uuid(),
  debit: z.number().min(0),
  credit: z.number().min(0),
});

/** Aprueba (persiste) el asiento de una etapa del cierre, con montos ya editados. (US 5.3.2) */
export const approveClosingStage = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      stage: z.enum(['refundicion', 'cierre', 'apertura']),
      lines: z.array(closingLineInput).min(2),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId, stage } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    if (fy.estado !== 'abierto')
      throw new Error('El ejercicio no está abierto');

    validateLineAmounts(ctx.data.lines);
    await assertPostableAccounts(
      clientId,
      orgId,
      ctx.data.lines.map((l) => l.accountId)
    );

    // Estado de etapas previas.
    const closingEntries = await db
      .select({ number: asiento.numero })
      .from(asiento)
      .where(
        and(
          eq(asiento.clienteId, clientId),
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.origenTipo, 'cierre'),
          eq(asiento.anulado, false)
        )
      )
      .orderBy(asc(asiento.numero));
    const refDone = closingEntries.length >= 1;
    const cierreDone = closingEntries.length >= 2;

    if (stage === 'refundicion' && refDone)
      throw new Error('La refundición ya fue registrada');
    if (stage === 'cierre') {
      if (!refDone) throw new Error('Primero registrá la refundición');
      if (cierreDone)
        throw new Error('El cierre patrimonial ya fue registrado');
    }
    if (stage === 'apertura' && !cierreDone)
      throw new Error('Primero registrá el cierre patrimonial');

    // Período donde caen los asientos de cierre = el del fin del ejercicio.
    const [lastPeriod] = await db
      .select()
      .from(periodoContable)
      .where(
        and(
          eq(periodoContable.ejercicioId, fy.id),
          eq(periodoContable.periodo, `${fy.fechaHasta.slice(0, 7)}-01`)
        )
      )
      .limit(1);
    if (!lastPeriod) throw new Error('No se encontró el período de cierre');

    const out = await db.transaction(async (tx) => {
      const insertEntry = async (
        fyId: string,
        periodId: string,
        date: string,
        number: number,
        origin: 'cierre' | 'apertura',
        description: string
      ) => {
        const [je] = await tx
          .insert(asiento)
          .values({
            orgId,
            clienteId: clientId,
            ejercicioId: fyId,
            periodoId: periodId,
            numero: number,
            fecha: date,
            descripcion: description,
            origenTipo: origin,
            // El check asiento_origen_coherente exige origen_id para todo
            // origen no manual. El origen de un cierre o una apertura es el
            // ejercicio que se está cerrando: se referencia ese.
            origenId: fy.id,
            creadoPor: userId,
          })
          .returning();
        await tx.insert(asientoLinea).values(
          ctx.data.lines.map((l, i) => ({
            asientoId: je.id,
            cuentaId: l.accountId,
            debe: String(l.debit),
            haber: String(l.credit),
            descripcion: description,
            orden: i,
          }))
        );
        return je.numero;
      };

      if (stage === 'apertura') {
        // Crea el próximo ejercicio (si no existe) + asiento de apertura.
        const nd = nextFyDates(fy.fechaHasta);
        const sY = periodoYear(nd.start);
        const sM = periodoMonth(nd.start) - 1;
        const [nfy] = await tx
          .insert(ejercicio)
          .values({
            orgId,
            clienteId: clientId,
            fechaDesde: nd.start,
            fechaHasta: nd.end,
            estado: 'abierto',
            numero: fy.numero + 1,
          })
          .returning();
        const periods = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(Date.UTC(sY, sM + i, 1));
          return {
            ejercicioId: nfy.id,
            clienteId: clientId,
            periodo: periodoDate(d.getUTCFullYear(), d.getUTCMonth() + 1),
            estado: 'abierto' as const,
          };
        });
        const inserted = await tx
          .insert(periodoContable)
          .values(periods)
          .returning();
        const first = inserted.find((p) => p.periodo === periods[0].periodo)!;
        await insertEntry(
          nfy.id,
          first.id,
          nd.start,
          1,
          'apertura',
          `Asiento de apertura · Ejercicio N°${nfy.numero}`
        );
        return { entryNumber: 1, nextFyNumber: nfy.numero };
      }

      // Refundición / cierre: número consecutivo del ejercicio.
      const [{ maxNum }] = await tx
        .select({
          maxNum: sql<number>`coalesce(max(${asiento.numero}),0)::int`,
        })
        .from(asiento)
        .where(
          and(eq(asiento.clienteId, clientId), eq(asiento.ejercicioId, fy.id))
        );
      const number = (maxNum ?? 0) + 1;
      const description =
        stage === 'refundicion'
          ? 'Refundición de cuentas de resultado'
          : 'Asiento de cierre patrimonial';
      await insertEntry(
        fy.id,
        lastPeriod.id,
        fy.fechaHasta,
        number,
        'cierre',
        description
      );
      return { entryNumber: number, nextFyNumber: null as number | null };
    });

    return { ok: true as const, stage, ...out };
  });

/** Sella el ejercicio: status='cerrado' + log. (US 5.3.3) */
export const sealClosing = createServerFn({ method: 'POST' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    if (fy.estado !== 'abierto')
      throw new Error('El ejercicio ya está cerrado');

    const closingEntries = await db
      .select({ id: asiento.id })
      .from(asiento)
      .where(
        and(
          eq(asiento.clienteId, clientId),
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.origenTipo, 'cierre'),
          eq(asiento.anulado, false)
        )
      );
    if (closingEntries.length < 2) {
      throw new Error(
        'Faltan etapas: registrá la refundición y el cierre patrimonial antes de sellar'
      );
    }

    await db
      .update(ejercicio)
      .set({ estado: 'cerrado', cerradoAt: sql`now()`, cerradoPor: userId })
      .where(eq(ejercicio.id, fy.id));
    await db.insert(evento).values(
      accountingEvent({
        orgId,
        clientId,
        fiscalYearId: fy.id,
        eventType: 'fiscal_year_closed',
        entityId: fy.id,
        data: { number: fy.numero },
        userId,
      })
    );
    return { ok: true as const };
  });

/* ════════════════ Estado de Situación Patrimonial (US 6.1.x) ════════════════ */

interface EspBalance {
  accountId: string;
  code: string;
  name: string;
  group: string | null;
  saldo: number; // debe − haber
}

/**
 * Saldos por cuenta de un ejercicio EXCLUYENDO el asiento de cierre. Así el ESP
 * refleja la posición patrimonial pre-cierre (si no, un ejercicio cerrado daría
 * todo en cero) y el resultado se computa de las cuentas de resultado.
 *
 * La apertura SÍ cuenta: el saldo de una cuenta patrimonial es apertura +
 * movimientos, y un ejercicio transcripto como referencia vive justamente de su
 * asiento de apertura. (La base excluía la apertura; la rama de balances lo
 * corrigió y esa semántica es la que manda.)
 *
 * `view = 'historico'` excluye además el asiento del ajuste por inflación: es
 * el toggle histórico/ajustado de los estados.
 */
async function computeEspBalances(
  orgId: string,
  fyId: string,
  view: 'ajustado' | 'historico' = 'ajustado'
): Promise<EspBalance[]> {
  const excluded =
    view === 'historico'
      ? sql`${asiento.origenTipo} NOT IN ('cierre','ajuste_inflacion')`
      : sql`${asiento.origenTipo} <> 'cierre'`;
  const rows = await db
    .select({
      accountId: cuenta.id,
      code: cuenta.codigo,
      name: cuenta.nombre,
      group: cuenta.rubro,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
    .where(
      and(
        eq(asiento.ejercicioId, fyId),
        eq(asiento.anulado, false),
        eq(cuenta.orgId, orgId),
        excluded
      )
    )
    .groupBy(cuenta.id, cuenta.codigo, cuenta.nombre, cuenta.rubro);
  return rows.map((r) => ({
    accountId: r.accountId,
    code: r.code,
    name: r.name,
    group: r.group,
    saldo: r2(parseFloat(r.debit) - parseFloat(r.credit)),
  }));
}

/**
 * ¿La columna comparativa de este ejercicio es exacta?
 *
 * Lo es si el ejercicio tiene su propio ajuste aplicado, o si se cargó como
 * referencia declarando que los saldos ya venían ajustados —que es lo normal al
 * transcribir un balance presentado, porque ya viene en moneda de su cierre—.
 */
function priorFiguresAreHomogeneous(
  fy: FiscalYearRow,
  adjustmentApplied: boolean
): boolean {
  return adjustmentApplied || (fy.soloReferencia && fy.estadosAjustados);
}

async function loadInflationStatus(fyId: string): Promise<{
  applied: boolean;
  stale: boolean;
  recpam: number | null;
  journalEntryNumber: number | null;
}> {
  const [adj] = await db
    .select()
    .from(ajusteInflacion)
    .where(
      and(
        eq(ajusteInflacion.ejercicioId, fyId),
        eq(ajusteInflacion.estado, 'aplicado')
      )
    )
    .limit(1);
  if (!adj) {
    return {
      applied: false,
      stale: false,
      recpam: null,
      journalEntryNumber: null,
    };
  }

  let journalEntryNumber: number | null = null;
  if (adj.asientoId) {
    const [je] = await db
      .select({ numero: asiento.numero })
      .from(asiento)
      .where(eq(asiento.id, adj.asientoId))
      .limit(1);
    journalEntryNumber = je?.numero ?? null;
  }

  // El asiento del ajuste debe ser el último movimiento no-cierre del ejercicio:
  // si después se cargó cualquier otro asiento, el ajuste quedó viejo.
  let stale = false;
  if (adj.aplicadoAt) {
    const [{ posteriores }] = await db
      .select({ posteriores: sql<number>`count(*)::int` })
      .from(asiento)
      .where(
        and(
          eq(asiento.ejercicioId, fyId),
          eq(asiento.anulado, false),
          gt(asiento.createdAt, adj.aplicadoAt),
          sql`${asiento.origenTipo} NOT IN ('cierre','ajuste_inflacion')`
        )
      );
    stale = posteriores > 0;
  }

  return {
    applied: true,
    stale,
    recpam: Number(adj.recpam),
    journalEntryNumber,
  };
}

/**
 * Ejercicio inmediato anterior de la empresa: el último que termina antes de
 * que empiece este.
 *
 * Se busca por fecha y no por `numero - 1` porque el número se asigna por orden
 * de creación. Un estudio que carga primero el ejercicio corriente y después
 * transcribe el anterior como referencia lo tendría numerado al revés, y el
 * comparativo no lo encontraría.
 */
async function loadPriorFiscalYear(
  clientId: string,
  fy: FiscalYearRow
): Promise<FiscalYearRow | null> {
  const [row] = await db
    .select()
    .from(ejercicio)
    .where(
      and(
        eq(ejercicio.clienteId, clientId),
        lt(ejercicio.fechaHasta, fy.fechaDesde)
      )
    )
    .orderBy(desc(ejercicio.fechaHasta))
    .limit(1);
  return row ?? null;
}

/**
 * Coeficiente para llevar la columna comparativa a la moneda de cierre actual.
 *
 * Los EECC del ejercicio anterior están expresados en moneda de SU cierre. Para
 * exponerlos al lado de los del ejercicio corriente hay que reexpresarlos, si no
 * se estarían comparando pesos de distinto poder adquisitivo (RT 6). Como el
 * ejercicio anterior ya es homogéneo, alcanza con un único coeficiente:
 * índice del cierre actual sobre índice del cierre anterior.
 *
 * Devuelve `null` si falta alguno de los dos índices; en ese caso el comparativo
 * queda en valores históricos y se avisa en la UI.
 *
 * Las fechas llegan como string 'YYYY-MM-DD' (columnas `date` de drizzle).
 */
async function priorColumnCoefficient(
  currentEnd: string,
  priorEnd: string
): Promise<number | null> {
  const load = async (d: string) => {
    const [row] = await db
      .select({ valor: indiceInflacion.valor })
      .from(indiceInflacion)
      .where(
        and(
          eq(indiceInflacion.fuente, 'facpce_rt6'),
          eq(indiceInflacion.anio, parseInt(d.slice(0, 4), 10)),
          eq(indiceInflacion.mes, parseInt(d.slice(5, 7), 10))
        )
      )
      .limit(1);
    return row ? Number(row.valor) : null;
  };
  const [cur, pri] = await Promise.all([load(currentEnd), load(priorEnd)]);
  if (!cur || !pri || pri <= 0) return null;
  return Math.round((cur / pri) * 10000) / 10000;
}

export interface EspAccountRow {
  accountId: string;
  code: string;
  name: string;
  current: number;
  prior: number;
}
export interface EspRubro {
  group: string;
  label: string;
  current: number;
  prior: number;
  accounts: EspAccountRow[];
}
export interface EspSection {
  key: string;
  label: string;
  macro: 'activo' | 'pasivo' | 'pn';
  rubros: EspRubro[];
  current: number;
  prior: number;
}
export interface EspResult {
  fiscalYearNumber: number;
  priorFiscalYearNumber: number | null;
  periodLabel: string;
  sections: EspSection[];
  totals: {
    activo: { current: number; prior: number };
    pasivo: { current: number; prior: number };
    pn: { current: number; prior: number };
    pasivoMasPn: { current: number; prior: number };
  };
  balancedCurrent: boolean;
  balancedPrior: boolean;
  hasPrior: boolean;
}

const ESP_SECTIONS = ACCOUNT_GROUP_SECTIONS.filter(
  (s) => s.section !== 'Resultados'
);

/** Estado de Situación Patrimonial comparativo (actual vs anterior). (US 6.1.1/6.1.2) */
export const getESP = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx): Promise<EspResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [priorFy] = await db
      .select()
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          eq(ejercicio.numero, fy.numero - 1)
        )
      )
      .limit(1);

    const curBal = await computeEspBalances(orgId, fy.id);
    const priBal = priorFy ? await computeEspBalances(orgId, priorFy.id) : [];
    const curMap = new Map(curBal.map((b) => [b.accountId, b]));
    const priMap = new Map(priBal.map((b) => [b.accountId, b]));

    const sign = (macro: 'activo' | 'pasivo' | 'pn', saldo: number) =>
      macro === 'activo' ? saldo : r2(-saldo);

    const macroOf = (sectionLabel: string): 'activo' | 'pasivo' | 'pn' =>
      sectionLabel.startsWith('Activo')
        ? 'activo'
        : sectionLabel.startsWith('Pasivo')
          ? 'pasivo'
          : 'pn';

    const sections: EspSection[] = ESP_SECTIONS.map((sec) => {
      const macro = macroOf(sec.section);
      const rubros: EspRubro[] = [];
      for (const group of sec.groups) {
        // El rubro "Resultado del ejercicio" se compone de las cuentas de resultado.
        const isResultado = group === RESULT_TARGET_GROUP;
        const groupsToPull = isResultado ? RESULT_ACCOUNT_GROUPS : [group];
        const accIds = new Set<string>();
        for (const b of curBal)
          if (b.group && (groupsToPull as readonly string[]).includes(b.group))
            accIds.add(b.accountId);
        for (const b of priBal)
          if (b.group && (groupsToPull as readonly string[]).includes(b.group))
            accIds.add(b.accountId);

        const accounts: EspAccountRow[] = [];
        let curTotal = 0;
        let priTotal = 0;
        for (const id of accIds) {
          const cb = curMap.get(id);
          const pb = priMap.get(id);
          const ref = cb ?? pb!;
          const cur = sign(macro, cb?.saldo ?? 0);
          const pri = sign(macro, pb?.saldo ?? 0);
          if (Math.abs(cur) < 0.005 && Math.abs(pri) < 0.005) continue;
          accounts.push({
            accountId: id,
            code: ref.code,
            name: ref.name,
            current: cur,
            prior: pri,
          });
          curTotal = r2(curTotal + cur);
          priTotal = r2(priTotal + pri);
        }
        if (accounts.length === 0) continue;
        accounts.sort((a, b) => a.code.localeCompare(b.code));
        rubros.push({
          group,
          label: ACCOUNT_GROUP_LABELS[group] ?? group,
          current: curTotal,
          prior: priTotal,
          accounts,
        });
      }
      return {
        key: sec.section,
        label: sec.section,
        macro,
        rubros,
        current: r2(rubros.reduce((s, r) => s + r.current, 0)),
        prior: r2(rubros.reduce((s, r) => s + r.prior, 0)),
      };
    });

    const sumMacro = (
      macro: 'activo' | 'pasivo' | 'pn',
      col: 'current' | 'prior'
    ) =>
      r2(
        sections
          .filter((s) => s.macro === macro)
          .reduce((s, sec) => s + sec[col], 0)
      );

    const totals = {
      activo: {
        current: sumMacro('activo', 'current'),
        prior: sumMacro('activo', 'prior'),
      },
      pasivo: {
        current: sumMacro('pasivo', 'current'),
        prior: sumMacro('pasivo', 'prior'),
      },
      pn: {
        current: sumMacro('pn', 'current'),
        prior: sumMacro('pn', 'prior'),
      },
      pasivoMasPn: { current: 0, prior: 0 },
    };
    totals.pasivoMasPn = {
      current: r2(totals.pasivo.current + totals.pn.current),
      prior: r2(totals.pasivo.prior + totals.pn.prior),
    };

    // Columnas `date`: llegan como string YYYY-MM-DD.
    const fmtD = (d: string) =>
      `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

    return {
      fiscalYearNumber: fy.numero,
      priorFiscalYearNumber: priorFy?.numero ?? null,
      periodLabel: `${fmtD(fy.fechaDesde)} – ${fmtD(fy.fechaHasta)}`,
      sections,
      totals,
      balancedCurrent:
        Math.abs(totals.activo.current - totals.pasivoMasPn.current) < 0.005,
      balancedPrior: priorFy
        ? Math.abs(totals.activo.prior - totals.pasivoMasPn.prior) < 0.005
        : true,
      hasPrior: !!priorFy,
    };
  });

/* ── Estado de Resultados (ER) — Fase 6.2 ── */

export interface ErLine {
  key: string;
  label: string;
  kind: 'component' | 'subtotal';
  current: number;
  prior: number;
  accounts: EspAccountRow[]; // vacío en los subtotales
}
export interface ErResult {
  fiscalYearNumber: number;
  priorFiscalYearNumber: number | null;
  periodLabel: string;
  lines: ErLine[];
  resultadoCurrent: number;
  resultadoPrior: number;
  /** Resultado del ejercicio según el ESP (saldo de la cuenta Resultado del ejercicio). */
  espResultadoCurrent: number;
  espResultadoPrior: number;
  matchesEspCurrent: boolean;
  matchesEspPrior: boolean;
  hasPrior: boolean;
}

/** Líneas de componentes del ER (los subtotales se intercalan al armar). */
const ER_COMPONENTS: {
  key: string;
  label: string;
  groups: readonly string[];
}[] = [
  { key: 'ventas', label: 'Ventas netas', groups: ['ventas'] },
  { key: 'costo_ventas', label: 'Costo de ventas', groups: ['costo_ventas'] },
  {
    key: 'gastos_administracion',
    label: 'Gastos de administración',
    groups: ['gastos_administracion'],
  },
  {
    key: 'gastos_comercializacion',
    label: 'Gastos de comercialización',
    groups: ['gastos_comercializacion'],
  },
  {
    key: 'gastos_financieros',
    label: 'Gastos financieros',
    groups: ['gastos_financieros'],
  },
  {
    key: 'otros_resultados',
    label: 'Otros resultados',
    groups: ['otros_resultados_pos', 'otros_resultados_neg'],
  },
  {
    key: 'impuesto_ganancias',
    label: 'Impuesto a las ganancias',
    groups: ['impuesto_ganancias'],
  },
];

/** Estado de Resultados comparativo (actual vs anterior). (US 6.2.1/6.2.2) */
export const getER = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx): Promise<ErResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [priorFy] = await db
      .select()
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          eq(ejercicio.numero, fy.numero - 1)
        )
      )
      .limit(1);

    const curBal = await computeEspBalances(orgId, fy.id);
    const priBal = priorFy ? await computeEspBalances(orgId, priorFy.id) : [];
    const curMap = new Map(curBal.map((b) => [b.accountId, b]));
    const priMap = new Map(priBal.map((b) => [b.accountId, b]));

    // Para el ER el aporte de toda cuenta de resultado es (−saldo):
    // ingresos (acreedoras) suman, gastos (deudoras) restan.
    const buildComponent = (groups: readonly string[]) => {
      const accIds = new Set<string>();
      for (const b of curBal)
        if (b.group && groups.includes(b.group)) accIds.add(b.accountId);
      for (const b of priBal)
        if (b.group && groups.includes(b.group)) accIds.add(b.accountId);

      const accounts: EspAccountRow[] = [];
      let cur = 0;
      let pri = 0;
      for (const id of accIds) {
        const cb = curMap.get(id);
        const pb = priMap.get(id);
        const ref = cb ?? pb!;
        const c = r2(-(cb?.saldo ?? 0));
        const p = r2(-(pb?.saldo ?? 0));
        if (Math.abs(c) < 0.005 && Math.abs(p) < 0.005) continue;
        accounts.push({
          accountId: id,
          code: ref.code,
          name: ref.name,
          current: c,
          prior: p,
        });
        cur = r2(cur + c);
        pri = r2(pri + p);
      }
      accounts.sort((a, b) => a.code.localeCompare(b.code));
      return { accounts, current: cur, prior: pri };
    };

    const comp = new Map(
      ER_COMPONENTS.map((c) => [c.key, { ...c, ...buildComponent(c.groups) }])
    );
    const compLine = (key: string): ErLine => {
      const c = comp.get(key)!;
      return {
        key,
        label: c.label,
        kind: 'component',
        current: c.current,
        prior: c.prior,
        accounts: c.accounts,
      };
    };

    const ventas = comp.get('ventas')!;
    const costo = comp.get('costo_ventas')!;
    const resBruto = {
      current: r2(ventas.current + costo.current),
      prior: r2(ventas.prior + costo.prior),
    };
    const admin = comp.get('gastos_administracion')!;
    const comerc = comp.get('gastos_comercializacion')!;
    const fin = comp.get('gastos_financieros')!;
    const otros = comp.get('otros_resultados')!;
    const resOperativo = {
      current: r2(
        resBruto.current +
          admin.current +
          comerc.current +
          fin.current +
          otros.current
      ),
      prior: r2(
        resBruto.prior + admin.prior + comerc.prior + fin.prior + otros.prior
      ),
    };
    const impuesto = comp.get('impuesto_ganancias')!;
    const resEjercicio = {
      current: r2(resOperativo.current + impuesto.current),
      prior: r2(resOperativo.prior + impuesto.prior),
    };

    const subtotal = (
      key: string,
      label: string,
      v: { current: number; prior: number }
    ): ErLine => ({
      key,
      label,
      kind: 'subtotal',
      current: v.current,
      prior: v.prior,
      accounts: [],
    });

    const lines: ErLine[] = [
      compLine('ventas'),
      compLine('costo_ventas'),
      subtotal('resultado_bruto', 'Resultado bruto', resBruto),
      compLine('gastos_administracion'),
      compLine('gastos_comercializacion'),
      compLine('gastos_financieros'),
      compLine('otros_resultados'),
      subtotal('resultado_operativo', 'Resultado operativo', resOperativo),
      compLine('impuesto_ganancias'),
      subtotal('resultado_ejercicio', 'Resultado del ejercicio', resEjercicio),
    ];

    // US 6.2.2 — consistencia ESP↔ER: el resultado del ER debe coincidir con el
    // saldo de "Resultado del ejercicio" del ESP, computado independientemente
    // como −(suma de saldos de todas las cuentas de resultado).
    const espResultado = (bal: EspBalance[]) =>
      r2(
        -bal
          .filter(
            (b) =>
              b.group &&
              (RESULT_ACCOUNT_GROUPS as readonly string[]).includes(b.group)
          )
          .reduce((s, b) => s + b.saldo, 0)
      );
    const espResultadoCurrent = espResultado(curBal);
    const espResultadoPrior = espResultado(priBal);

    // Columnas `date`: llegan como string YYYY-MM-DD.
    const fmtD = (d: string) =>
      `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

    return {
      fiscalYearNumber: fy.numero,
      priorFiscalYearNumber: priorFy?.numero ?? null,
      periodLabel: `${fmtD(fy.fechaDesde)} – ${fmtD(fy.fechaHasta)}`,
      lines,
      resultadoCurrent: resEjercicio.current,
      resultadoPrior: resEjercicio.prior,
      espResultadoCurrent,
      espResultadoPrior,
      matchesEspCurrent:
        Math.abs(resEjercicio.current - espResultadoCurrent) < 0.005,
      matchesEspPrior: priorFy
        ? Math.abs(resEjercicio.prior - espResultadoPrior) < 0.005
        : true,
      hasPrior: !!priorFy,
    };
  });

/* ── Anexo II — Gastos por función (US 6.3.2) ── */

type ExpenseFunction =
  | 'administracion'
  | 'comercializacion'
  | 'financiero'
  | 'otro';

/** Mapeo de rubro de gasto → función, cuando la cuenta no tiene expenseFunction explícito. */
const EXPENSE_GROUP_TO_FUNCTION: Record<string, ExpenseFunction> = {
  gastos_administracion: 'administracion',
  gastos_comercializacion: 'comercializacion',
  gastos_financieros: 'financiero',
  costo_ventas: 'otro',
  otros_resultados_neg: 'otro',
  impuesto_ganancias: 'otro',
};

const EXPENSE_FUNCTION_ORDER: ExpenseFunction[] = [
  'administracion',
  'comercializacion',
  'financiero',
  'otro',
];

export interface AnexoIIAccount {
  accountId: string;
  code: string;
  name: string;
  current: number;
  prior: number;
}
export interface AnexoIIFunction {
  key: ExpenseFunction;
  label: string;
  current: number;
  prior: number;
  accounts: AnexoIIAccount[];
}
export interface AnexoIIResult {
  fiscalYearNumber: number;
  priorFiscalYearNumber: number | null;
  periodLabel: string;
  functions: AnexoIIFunction[];
  totalCurrent: number;
  totalPrior: number;
  hasPrior: boolean;
}

/** Saldos de las cuentas de gasto (con su función) de un ejercicio, excluyendo cierres. */
async function computeExpenseBalances(orgId: string, fyId: string) {
  const rows = await db
    .select({
      accountId: cuenta.id,
      code: cuenta.codigo,
      name: cuenta.nombre,
      group: cuenta.rubro,
      expenseFunction: cuenta.funcionGasto,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .innerJoin(cuenta, eq(cuenta.id, asientoLinea.cuentaId))
    .where(
      and(
        eq(asiento.ejercicioId, fyId),
        eq(asiento.anulado, false),
        eq(cuenta.orgId, orgId),
        inArray(
          cuenta.rubro,
          EXPENSE_ACCOUNT_GROUPS as unknown as AccountGroup[]
        ),
        sql`${asiento.origenTipo} NOT IN ('cierre','apertura')`
      )
    )
    .groupBy(
      cuenta.id,
      cuenta.codigo,
      cuenta.nombre,
      cuenta.rubro,
      cuenta.funcionGasto
    );
  return rows.map((r) => ({
    accountId: r.accountId,
    code: r.code,
    name: r.name,
    fn: r.expenseFunction ?? EXPENSE_GROUP_TO_FUNCTION[r.group ?? ''] ?? 'otro',
    saldo: r2(parseFloat(r.debit) - parseFloat(r.credit)),
  }));
}

/** Anexo II — clasifica los gastos del ER por función, con comparativo. (US 6.3.2) */
export const getAnexoII = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx): Promise<AnexoIIResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [priorFy] = await db
      .select()
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          eq(ejercicio.numero, fy.numero - 1)
        )
      )
      .limit(1);

    const curBal = await computeExpenseBalances(orgId, fy.id);
    const priBal = priorFy
      ? await computeExpenseBalances(orgId, priorFy.id)
      : [];
    const curMap = new Map(curBal.map((b) => [b.accountId, b]));
    const priMap = new Map(priBal.map((b) => [b.accountId, b]));

    const functions: AnexoIIFunction[] = [];
    for (const fn of EXPENSE_FUNCTION_ORDER) {
      const accIds = new Set<string>();
      for (const b of curBal) if (b.fn === fn) accIds.add(b.accountId);
      for (const b of priBal) if (b.fn === fn) accIds.add(b.accountId);

      const accounts: AnexoIIAccount[] = [];
      let cur = 0;
      let pri = 0;
      for (const id of accIds) {
        const cb = curMap.get(id);
        const pb = priMap.get(id);
        const ref = cb ?? pb!;
        // Gasto = saldo deudor (positivo).
        const c = r2(cb?.saldo ?? 0);
        const p = r2(pb?.saldo ?? 0);
        if (Math.abs(c) < 0.005 && Math.abs(p) < 0.005) continue;
        accounts.push({
          accountId: id,
          code: ref.code,
          name: ref.name,
          current: c,
          prior: p,
        });
        cur = r2(cur + c);
        pri = r2(pri + p);
      }
      if (accounts.length === 0) continue;
      accounts.sort((a, b) => a.code.localeCompare(b.code));
      functions.push({
        key: fn,
        label: EXPENSE_FUNCTION_LABELS[fn],
        current: cur,
        prior: pri,
        accounts,
      });
    }

    // Columnas `date`: llegan como string YYYY-MM-DD.
    const fmtD = (d: string) =>
      `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

    return {
      fiscalYearNumber: fy.numero,
      priorFiscalYearNumber: priorFy?.numero ?? null,
      periodLabel: `${fmtD(fy.fechaDesde)} – ${fmtD(fy.fechaHasta)}`,
      functions,
      totalCurrent: r2(functions.reduce((s, f) => s + f.current, 0)),
      totalPrior: r2(functions.reduce((s, f) => s + f.prior, 0)),
      hasPrior: !!priorFy,
    };
  });

/* ══════════ Anexo Costo de Mercadería Vendida (CMV) — carga manual ══════════ */

export interface CmvResult {
  fiscalYearNumber: number;
  periodLabel: string;
  existenciaInicial: number;
  comprasGastos: number;
  existenciaFinal: number;
  /** CMV = existencia inicial + compras/gastos − existencia final. */
  total: number;
  priorFiscalYearNumber: number | null;
  priorTotal: number | null;
  hasData: boolean;
}

/** Columnas `date`: llegan como string YYYY-MM-DD. */
const fmtDateDMY = (d: string) =>
  `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const cmvTotal = (
  ini: string | number,
  compras: string | number,
  fin: string | number
) =>
  r2(
    (typeof ini === 'number' ? ini : parseFloat(ini || '0')) +
      (typeof compras === 'number' ? compras : parseFloat(compras || '0')) -
      (typeof fin === 'number' ? fin : parseFloat(fin || '0'))
  );

/** Anexo de Costo de Mercadería Vendida del ejercicio (valores de carga manual). */
export const getCMV = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
    })
  )
  .handler(async (ctx): Promise<CmvResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [row] = await db
      .select()
      .from(anexoCmv)
      .where(eq(anexoCmv.ejercicioId, fy.id))
      .limit(1);

    const ini = row ? parseFloat(row.existenciaInicial) : 0;
    const compras = row ? parseFloat(row.comprasGastos) : 0;
    const fin = row ? parseFloat(row.existenciaFinal) : 0;

    // Comparativo con el ejercicio anterior (número − 1), si tiene CMV cargado.
    let priorFiscalYearNumber: number | null = null;
    let priorTotal: number | null = null;
    const [priorFy] = await db
      .select()
      .from(ejercicio)
      .where(
        and(
          eq(ejercicio.clienteId, clientId),
          eq(ejercicio.numero, fy.numero - 1)
        )
      )
      .limit(1);
    if (priorFy) {
      priorFiscalYearNumber = priorFy.numero;
      const [pr] = await db
        .select()
        .from(anexoCmv)
        .where(eq(anexoCmv.ejercicioId, priorFy.id))
        .limit(1);
      if (pr)
        priorTotal = cmvTotal(
          pr.existenciaInicial,
          pr.comprasGastos,
          pr.existenciaFinal
        );
    }

    return {
      fiscalYearNumber: fy.numero,
      periodLabel: `${fmtDateDMY(fy.fechaDesde)} – ${fmtDateDMY(fy.fechaHasta)}`,
      existenciaInicial: ini,
      comprasGastos: compras,
      existenciaFinal: fin,
      total: cmvTotal(ini, compras, fin),
      priorFiscalYearNumber,
      priorTotal,
      hasData: !!row,
    };
  });

/** Guarda (upsert) los valores manuales del Anexo CMV del ejercicio. */
export const saveCMV = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      existenciaInicial: z.number(),
      comprasGastos: z.number(),
      existenciaFinal: z.number(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const vals = {
      existenciaInicial: ctx.data.existenciaInicial.toFixed(2),
      comprasGastos: ctx.data.comprasGastos.toFixed(2),
      existenciaFinal: ctx.data.existenciaFinal.toFixed(2),
    };
    await db
      .insert(anexoCmv)
      .values({
        orgId,
        clienteId: clientId,
        ejercicioId: fy.id,
        ...vals,
      })
      .onConflictDoUpdate({
        target: anexoCmv.ejercicioId,
        set: vals,
      });
    return { ok: true };
  });

/* ── Notas y aprobación del paquete EECC (US 6.3.1 / 6.3.3) ── */

export interface FsNote {
  id: string;
  title: string;
  content: string;
}
export interface FinancialStatementResult {
  id: string | null;
  status: 'borrador' | 'aprobado';
  notes: FsNote[];
  approvedAt: string | null;
  approvedByName: string | null;
  /** Metadata del PDF guardado (no incluye el binario; usar getFinancialStatementPdf). */
  pdfGeneratedAt: string | null;
  pdfGeneratedByName: string | null;
  pdfSizeBytes: number | null;
}

const fsNoteSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  content: z.string().max(20000),
});

/** Devuelve el eecc del ejercicio (o un borrador vacío si no existe). */
export const getFinancialStatement = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx): Promise<FinancialStatementResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId, fiscalYearId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    await loadFiscalYearForOrg(fiscalYearId, orgId);

    const pdfUser = alias(user, 'fs_pdf_user');
    const [row] = await db
      .select({
        id: eecc.id,
        status: eecc.estado,
        notes: eecc.notas,
        approvedAt: eecc.aprobadoAt,
        approvedByName: user.name,
        pdfGeneratedAt: eecc.pdfGeneradoAt,
        pdfSizeBytes: eecc.pdfBytes,
        pdfGeneratedByName: pdfUser.name,
      })
      .from(eecc)
      .leftJoin(user, eq(user.id, eecc.aprobadoPor))
      .leftJoin(pdfUser, eq(pdfUser.id, eecc.pdfGeneradoPor))
      .where(
        and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
      )
      .limit(1);

    if (!row) {
      return {
        id: null,
        status: 'borrador',
        notes: [],
        approvedAt: null,
        approvedByName: null,
        pdfGeneratedAt: null,
        pdfGeneratedByName: null,
        pdfSizeBytes: null,
      };
    }
    return {
      id: row.id,
      status: row.status,
      notes: (row.notes as FsNote[]) ?? [],
      approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
      approvedByName: row.approvedByName ?? null,
      pdfGeneratedAt: row.pdfGeneratedAt
        ? row.pdfGeneratedAt.toISOString()
        : null,
      pdfGeneratedByName: row.pdfGeneratedByName ?? null,
      pdfSizeBytes: row.pdfSizeBytes ?? null,
    };
  });

/** Guarda (upsert) las notas markdown del paquete. Bloqueado si ya está aprobado. (US 6.3.1) */
export const saveFinancialStatementNotes = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      notes: z.array(fsNoteSchema).max(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId, fiscalYearId, notes } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    await loadFiscalYearForOrg(fiscalYearId, orgId);

    const [existing] = await db
      .select({ id: eecc.id, status: eecc.estado })
      .from(eecc)
      .where(
        and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
      )
      .limit(1);

    if (existing?.status === 'aprobado') {
      throw new Error(
        'Los EECC están aprobados. Reabrilos a borrador para editar las notas.'
      );
    }

    if (existing) {
      await db
        .update(eecc)
        .set({ notas: notes })
        .where(eq(eecc.id, existing.id));
    } else {
      await db.insert(eecc).values({
        orgId,
        clienteId: clientId,
        ejercicioId: fiscalYearId,
        notas: notes,
      });
    }
    return { ok: true };
  });

/** Aprueba el paquete EECC: status draft→approved, queda inmutable y se registra en el log. (US 6.3.3) */
export const approveFinancialStatement = createServerFn({ method: 'POST' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId, fiscalYearId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(fiscalYearId, orgId);

    // Integridad: el ESP debe cuadrar (suma de saldos = 0) antes de aprobar.
    const bal = await computeEspBalances(orgId, fy.id);
    const sumSaldos = bal.reduce((s, b) => s + b.saldo, 0);
    if (Math.abs(sumSaldos) >= 0.005) {
      throw new Error(
        'No se puede aprobar: los Estados Contables no cuadran (Activo ≠ Pasivo + PN).'
      );
    }

    const [existing] = await db
      .select({ id: eecc.id, status: eecc.estado })
      .from(eecc)
      .where(
        and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
      )
      .limit(1);

    if (existing?.status === 'aprobado') {
      throw new Error('Los EECC ya están aprobados.');
    }

    const now = new Date();
    if (existing) {
      await db
        .update(eecc)
        .set({ estado: 'aprobado', aprobadoAt: now, aprobadoPor: userId })
        .where(eq(eecc.id, existing.id));
    } else {
      await db.insert(eecc).values({
        orgId,
        clienteId: clientId,
        ejercicioId: fiscalYearId,
        estado: 'aprobado',
        aprobadoAt: now,
        aprobadoPor: userId,
      });
    }

    await db.insert(evento).values(
      accountingEvent({
        orgId,
        clientId,
        fiscalYearId,
        eventType: 'financial_statement_approved',
        entityId: fiscalYearId,
        data: { fiscalYearNumber: fy.numero },
        userId,
      })
    );

    return { ok: true };
  });

/** Reabre un paquete aprobado a borrador para poder regenerarlo/editarlo. (US 6.3.3) */
export const reopenFinancialStatement = createServerFn({ method: 'POST' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId, fiscalYearId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    await loadFiscalYearForOrg(fiscalYearId, orgId);

    await db
      .update(eecc)
      .set({ estado: 'borrador', aprobadoAt: null, aprobadoPor: null })
      .where(
        and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
      );
    return { ok: true };
  });

/* ── Persistencia del PDF del paquete EECC (US 7.1.1) ── */

/** Guarda el PDF generado del paquete asociado al eecc del ejercicio. */
export const saveFinancialStatementPdf = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      // data URL base64 del PDF (data:application/pdf;base64,...). Tope ~12MB.
      dataUrl: z
        .string()
        .min(1)
        .max(16_000_000)
        .refine((s) => s.startsWith('data:application/pdf;base64,'), {
          message: 'PDF inválido',
        }),
      sizeBytes: z.number().int().nonnegative(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId, fiscalYearId, dataUrl, sizeBytes } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    await loadFiscalYearForOrg(fiscalYearId, orgId);

    const [existing] = await db
      .select({ id: eecc.id })
      .from(eecc)
      .where(
        and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
      )
      .limit(1);

    // El PDF va a R2; en la DB queda la key, nunca el binario.
    const pdfKey = r2Storage.eeccKey(orgId, clientId, fiscalYearId);
    await r2Storage.upload(
      pdfKey,
      Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
      'application/pdf'
    );

    const now = new Date();
    if (existing) {
      await db
        .update(eecc)
        .set({
          pdfKey,
          pdfBytes: sizeBytes,
          pdfGeneradoAt: now,
          pdfGeneradoPor: userId,
        })
        .where(eq(eecc.id, existing.id));
    } else {
      await db.insert(eecc).values({
        orgId,
        clienteId: clientId,
        ejercicioId: fiscalYearId,
        pdfKey,
        pdfBytes: sizeBytes,
        pdfGeneradoAt: now,
        pdfGeneradoPor: userId,
      });
    }
    return { ok: true };
  });

/** URL temporal para re-descargar el PDF guardado del paquete, o null. */
export const getFinancialStatementPdf = createServerFn({ method: 'GET' })
  .validator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(
    async (
      ctx
    ): Promise<{ url: string; generatedAt: string | null } | null> => {
      const { orgId } = await getSessionWithOrg();
      const { clientId, fiscalYearId } = ctx.data;
      await ensureClientBelongsToOrg(clientId, orgId);
      await loadFiscalYearForOrg(fiscalYearId, orgId);

      const [row] = await db
        .select({
          pdfKey: eecc.pdfKey,
          pdfGeneratedAt: eecc.pdfGeneradoAt,
        })
        .from(eecc)
        .where(
          and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
        )
        .limit(1);

      if (!row?.pdfKey) return null;
      return {
        url: r2Storage.presign(row.pdfKey, 300),
        generatedAt: row.pdfGeneratedAt
          ? row.pdfGeneratedAt.toISOString()
          : null,
      };
    }
  );

/* ═════════ Saldos de un ejercicio de referencia (columna comparativa) ═════════ */

export interface ReferenceBalanceRow {
  accountId: string;
  code: string;
  name: string;
  group: string | null;
  groupLabel: string;
  /** Lado natural de la cuenta: define el signo de lo que se tipea. */
  side: 'debit' | 'credit';
  /** Saldo al inicio del ejercicio, como figura en el balance. */
  inicio: number;
  /** Saldo al cierre del ejercicio. */
  cierre: number;
}

export interface ReferenceBalancesView {
  fiscalYearNumber: number;
  periodLabel: string;
  /** Ya hay saldos cargados: guardar los reemplaza. */
  loaded: boolean;
  rows: ReferenceBalanceRow[];
}

/** Signo contable de un importe tipeado, según el lado natural de la cuenta. */
function signedForSide(amount: number, side: 'debit' | 'credit'): number {
  return side === 'credit' ? -amount : amount;
}

/**
 * Devuelve el plan de cuentas imputable de la empresa con los saldos ya
 * cargados, para transcribir un balance ya presentado sin armar los asientos a
 * mano.
 *
 * Solo aplica a ejercicios marcados como de referencia: son los únicos cuyo
 * libro diario existe nada más que para alimentar el comparativo, así que se
 * puede reemplazar entero sin pisarle trabajo a nadie.
 */
export const getReferenceBalances = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
    })
  )
  .handler(async (ctx): Promise<ReferenceBalancesView> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    if (!fy.soloReferencia) {
      throw new Error(
        'Los saldos se transcriben solo en ejercicios de referencia. Este ejercicio se liquida normalmente: cargá sus asientos en el Libro Diario.'
      );
    }

    const accounts = await db
      .select({
        id: cuenta.id,
        code: cuenta.codigo,
        name: cuenta.nombre,
        group: cuenta.rubro,
        expectedBalance: cuenta.saldoEsperado,
      })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          eq(cuenta.activa, true),
          sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${clientId})`
        )
      )
      .orderBy(asc(cuenta.codigo));

    // Saldos ya cargados: la apertura es la columna «inicio», y el cierre sale
    // de sumarle el asiento de movimientos.
    const lines = await db
      .select({
        accountId: asientoLinea.cuentaId,
        origin: asiento.origenTipo,
        debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(and(eq(asiento.ejercicioId, fy.id), eq(asiento.anulado, false)))
      .groupBy(asientoLinea.cuentaId, asiento.origenTipo);

    const inicioBy = new Map<string, number>();
    const cierreBy = new Map<string, number>();
    for (const l of lines) {
      const v = parseFloat(l.debit) - parseFloat(l.credit);
      if (l.origin === 'apertura') {
        inicioBy.set(l.accountId, (inicioBy.get(l.accountId) ?? 0) + v);
      }
      cierreBy.set(l.accountId, (cierreBy.get(l.accountId) ?? 0) + v);
    }

    const rows: ReferenceBalanceRow[] = accounts.map((a) => {
      const side: 'debit' | 'credit' =
        a.expectedBalance === 'acreedor' ? 'credit' : 'debit';
      // Se devuelve el importe tal como se tipea (positivo del lado natural),
      // que es como figura impreso en el balance.
      const unsign = (v: number) => r2(signedForSide(v, side));
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        group: a.group,
        groupLabel: a.group ? ACCOUNT_GROUP_LABELS[a.group] : '',
        side,
        inicio: unsign(inicioBy.get(a.id) ?? 0),
        cierre: unsign(cierreBy.get(a.id) ?? 0),
      };
    });

    const fmtD = (d: string) =>
      `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

    return {
      fiscalYearNumber: fy.numero,
      periodLabel: `${fmtD(fy.fechaDesde)} – ${fmtD(fy.fechaHasta)}`,
      loaded: lines.length > 0,
      rows,
    };
  });

/**
 * Transcribe un balance ya presentado en dos asientos: la apertura del
 * ejercicio y, como diferencia contra el cierre, sus movimientos.
 *
 * Se arma como diferencia y no como dos fotos porque así el libro diario del
 * ejercicio de referencia queda igual que el de cualquier otro —apertura más
 * movimientos— y los estados lo leen sin ningún caso especial.
 */
export const saveReferenceBalances = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      rows: z.array(
        z.object({
          accountId: z.string().uuid(),
          inicio: z.number(),
          cierre: z.number(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const { clientId, rows } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    assertCanWrite(await getMemberRole());
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    if (!fy.soloReferencia) {
      throw new Error(
        'Los saldos se transcriben solo en ejercicios de referencia.'
      );
    }

    const accounts = await db
      .select({
        id: cuenta.id,
        code: cuenta.codigo,
        expectedBalance: cuenta.saldoEsperado,
      })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${clientId})`
        )
      );
    const byId = new Map(accounts.map((a) => [a.id, a]));

    // Signo contable de cada columna.
    const inicio = new Map<string, number>();
    const movimiento = new Map<string, number>();
    for (const r of rows) {
      const a = byId.get(r.accountId);
      if (!a) continue;
      const side: 'debit' | 'credit' =
        a.expectedBalance === 'acreedor' ? 'credit' : 'debit';
      const ini = r2(signedForSide(r.inicio, side));
      const cie = r2(signedForSide(r.cierre, side));
      if (Math.abs(ini) >= 0.005) inicio.set(r.accountId, ini);
      // El movimiento del ejercicio es lo que va del inicio al cierre.
      const mov = r2(cie - ini);
      if (Math.abs(mov) >= 0.005) movimiento.set(r.accountId, mov);
    }

    const sum = (m: Map<string, number>) =>
      r2([...m.values()].reduce((s, v) => s + v, 0));
    const diffInicio = sum(inicio);
    const diffCierre = r2(diffInicio + sum(movimiento));
    if (Math.abs(diffInicio) >= 0.005) {
      throw new Error(
        `La columna «saldo al inicio» no cuadra: hay una diferencia de $ ${diffInicio.toFixed(2)} entre Debe y Haber.`
      );
    }
    if (Math.abs(diffCierre) >= 0.005) {
      throw new Error(
        `La columna «saldo al cierre» no cuadra: hay una diferencia de $ ${diffCierre.toFixed(2)} entre Debe y Haber.`
      );
    }
    if (inicio.size === 0 && movimiento.size === 0) {
      throw new Error('No hay ningún saldo cargado.');
    }

    const periods = await db
      .select()
      .from(periodoContable)
      .where(eq(periodoContable.ejercicioId, fy.id))
      .orderBy(asc(periodoContable.periodo));
    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    if (!firstPeriod || !lastPeriod) {
      throw new Error('El ejercicio no tiene períodos generados.');
    }

    await db.transaction(async (tx) => {
      // El libro diario de un ejercicio de referencia existe solo para esto,
      // así que se reemplaza entero en vez de intentar conciliar contra lo que
      // hubiera cargado antes.
      const previous = await tx
        .select({ id: asiento.id })
        .from(asiento)
        .where(eq(asiento.ejercicioId, fy.id));
      if (previous.length > 0) {
        const ids = previous.map((p) => p.id);
        await tx
          .delete(asientoLinea)
          .where(inArray(asientoLinea.asientoId, ids));
        await tx.delete(asiento).where(inArray(asiento.id, ids));
      }

      let number = 1;
      const write = async (
        amounts: Map<string, number>,
        entryDate: string,
        periodId: string,
        origin: 'apertura' | 'manual',
        description: string
      ) => {
        if (amounts.size === 0) return;
        const [je] = await tx
          .insert(asiento)
          .values({
            orgId,
            clienteId: clientId,
            ejercicioId: fy.id,
            periodoId: periodId,
            numero: number++,
            fecha: entryDate,
            descripcion: description,
            origenTipo: origin,
            // Ver asiento_origen_coherente: una apertura referencia al
            // ejercicio que la origina.
            origenId: origin === 'manual' ? null : fy.id,
            creadoPor: userId,
          })
          .returning({ id: asiento.id });
        await tx.insert(asientoLinea).values(
          [...amounts].map(([accountId, v], i) => ({
            asientoId: je.id,
            cuentaId: accountId,
            debe: (v > 0 ? v : 0).toFixed(2),
            haber: (v < 0 ? -v : 0).toFixed(2),
            orden: i,
          }))
        );
      };

      await write(
        inicio,
        fy.fechaDesde,
        firstPeriod.id,
        'apertura',
        'Saldos al inicio — balance del ejercicio anterior'
      );
      await write(
        movimiento,
        fy.fechaHasta,
        lastPeriod.id,
        'manual',
        'Movimientos del ejercicio — balance del ejercicio anterior'
      );
    });

    return { cuentas: inicio.size + movimiento.size };
  });

/* ── Informe del auditor: plantillas del estudio y el informe del balance ── */

export interface AuditReportTemplateRow {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
}

/** Plantillas del estudio, la predeterminada primero. */
export const listAuditReportTemplates = createServerFn({
  method: 'GET',
}).handler(async (): Promise<AuditReportTemplateRow[]> => {
  const { orgId } = await getSessionWithOrg();
  return await db
    .select({
      id: plantillaInformeAuditor.id,
      name: plantillaInformeAuditor.nombre,
      body: plantillaInformeAuditor.cuerpo,
      isDefault: plantillaInformeAuditor.esDefault,
    })
    .from(plantillaInformeAuditor)
    .where(eq(plantillaInformeAuditor.orgId, orgId))
    .orderBy(
      desc(plantillaInformeAuditor.esDefault),
      asc(plantillaInformeAuditor.nombre)
    );
});

export const saveAuditReportTemplate = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(120),
      body: z.string().min(1).max(60000),
      isDefault: z.boolean().default(false),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertOwner(await getMemberRole());
    const { id, name, body, isDefault } = ctx.data;

    return await db.transaction(async (tx) => {
      // Una sola predeterminada por estudio: con dos, cuál se propone
      // dependería del orden de la consulta.
      if (isDefault) {
        await tx
          .update(plantillaInformeAuditor)
          .set({ esDefault: false })
          .where(eq(plantillaInformeAuditor.orgId, orgId));
      }
      if (id) {
        const [row] = await tx
          .update(plantillaInformeAuditor)
          .set({ nombre: name, cuerpo: body, esDefault: isDefault })
          .where(
            and(
              eq(plantillaInformeAuditor.id, id),
              eq(plantillaInformeAuditor.orgId, orgId)
            )
          )
          .returning({ id: plantillaInformeAuditor.id });
        if (!row) {
          throw new Error('La plantilla no existe o es de otro estudio.');
        }
        return { id: row.id };
      }
      const [row] = await tx
        .insert(plantillaInformeAuditor)
        .values({
          orgId,
          nombre: name,
          cuerpo: body,
          esDefault: isDefault,
          creadoPor: userId,
        })
        .returning({ id: plantillaInformeAuditor.id });
      return { id: row.id };
    });
  });

export const deleteAuditReportTemplate = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertOwner(await getMemberRole());
    await db
      .delete(plantillaInformeAuditor)
      .where(
        and(
          eq(plantillaInformeAuditor.id, ctx.data.id),
          eq(plantillaInformeAuditor.orgId, orgId)
        )
      );
    return { ok: true };
  });

/** Guarda el informe ya rellenado de un balance. */
export const saveAuditReport = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      body: z.string().max(60000),
      lugar: z.string().max(160),
      fecha: z.string().max(40),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertOwner(await getMemberRole());
    const { clientId, fiscalYearId, body, lugar, fecha } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    await loadFiscalYearForOrg(fiscalYearId, orgId);

    const [existing] = await db
      .select({ id: eecc.id, estado: eecc.estado })
      .from(eecc)
      .where(
        and(eq(eecc.ejercicioId, fiscalYearId), eq(eecc.clienteId, clientId))
      )
      .limit(1);
    if (existing?.estado === 'aprobado') {
      throw new Error(
        'Los EECC están aprobados. Reabrilos a borrador para editar el informe.'
      );
    }

    const informeAuditor = { body, lugar, fecha };
    if (existing) {
      await db
        .update(eecc)
        .set({ informeAuditor })
        .where(eq(eecc.id, existing.id));
    } else {
      await db.insert(eecc).values({
        orgId,
        clienteId: clientId,
        ejercicioId: fiscalYearId,
        informeAuditor,
      });
    }
    return { ok: true };
  });

/* ── Estado de Evolución del Patrimonio Neto (EEPN) — AXI-6 ── */

/** Rubros que integran el patrimonio neto, en orden de exposición (RT 9). */
const PN_GROUPS = [
  'capital',
  'aportes_irrevocables',
  'primas_emision',
  'reservas',
  'resultados_no_asignados',
] as const;

export interface EepnColumn {
  /** Id de la cuenta, o `subtotal:<rubro>` en las columnas de subtotal. */
  accountId: string;
  code: string;
  name: string;
  group: string;
  groupLabel: string;
  /**
   * Cierra un rubro de más de una cuenta con su total, como el "Total" de
   * Capital Social del modelo RT 9 y de la planilla del estudio.
   */
  isSubtotal: boolean;
}

export interface EepnRow {
  key: string;
  label: string;
  kind: 'inicio' | 'movimiento' | 'resultado' | 'cierre';
  /** Importe por columna (accountId → importe, signo de exposición: positivo = suma al PN). */
  amounts: Record<string, number>;
  total: number;
  /** Solo en filas de movimiento: asiento que lo originó. */
  entryNumber?: number;
  entryDate?: string;
}

export interface EepnResult {
  fiscalYearNumber: number;
  priorFiscalYearNumber: number | null;
  periodLabel: string;
  columns: EepnColumn[];
  rows: EepnRow[];
  /**
   * Columna del ejercicio anterior, reexpresada a moneda de cierre. Se expone en
   * las tres filas que tiene el modelo RT 9: patrimonio al inicio de aquel
   * ejercicio, su resultado, y su patrimonio al cierre —que es el inicio de
   * este—. Así lo arma el papel de trabajo del estudio.
   */
  prior: { inicio: number; resultado: number; cierre: number } | null;
  priorCoefficient: number | null;
  /** Total del PN según el ESP; debe coincidir con el saldo al cierre. */
  espTotal: number;
  matchesEsp: boolean;
  /** El ajuste por inflación del ejercicio está aplicado. */
  inflationApplied: boolean;
  /**
   * El ejercicio anterior tiene su propio ajuste aplicado. Si es false, sus
   * cifras están en moneda heterogénea y multiplicarlas por un coeficiente no
   * las homogeneiza: el comparativo es aproximado y hay que decirlo.
   */
  priorInflationApplied: boolean;
}

/**
 * Estado de Evolución del Patrimonio Neto.
 *
 * Layout según el modelo RT 9 del CPCECABA: una columna por cuenta de PN
 * (agrupadas por rubro) y filas por causa de variación.
 *
 * Dos particularidades del ajuste por inflación, tomadas del papel de trabajo
 * del estudio:
 *
 * 1. La fila "Saldos al inicio" se expone **en moneda de cierre**: la
 *    reexpresión del patrimonio inicial se incorpora ahí y no aparece como un
 *    movimiento del ejercicio. El modelo RT 9 no tiene fila para exponerla.
 * 2. El Capital social queda a **valor nominal**: su reexpresión no se le imputa
 *    a él sino a Ajuste de capital (`cuenta.cuentaAjusteId`). Por eso la
 *    columna "Ajuste de capital" arranca con el ajuste anterior reexpresado más
 *    el del capital — las "dos fórmulas" que describió el contador.
 *
 * Las variaciones del ejercicio se exponen desglosadas por asiento, con su
 * descripción: el sistema no infiere si un movimiento es un dividendo o una
 * constitución de reserva, lo muestra tal como lo cargó el contador.
 */
export const getEEPN = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      view: z.enum(['ajustado', 'historico']).default('ajustado'),
    })
  )
  .handler(async (ctx): Promise<EepnResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId, view } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const priorFy = await loadPriorFiscalYear(clientId, fy);

    // Cuentas de PN visibles para la empresa.
    const pnAccounts = await db
      .select({
        id: cuenta.id,
        code: cuenta.codigo,
        name: cuenta.nombre,
        group: cuenta.rubro,
        inflationTargetId: cuenta.cuentaAjusteId,
      })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          inArray(cuenta.rubro, PN_GROUPS as unknown as AccountGroup[]),
          sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${clientId})`
        )
      )
      .orderBy(asc(cuenta.codigo));
    const pnIds = new Set(pnAccounts.map((a) => a.id));

    /** Signo de exposición: el PN es acreedor, así que se invierte. */
    const expose = (saldo: number) => r2(-saldo);

    // 1. Saldos de apertura (histórico), del asiento de apertura del ejercicio.
    const openingRows = await db
      .select({
        accountId: asientoLinea.cuentaId,
        debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(
        and(
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          eq(asiento.origenTipo, 'apertura')
        )
      )
      .groupBy(asientoLinea.cuentaId);

    const inicio: Record<string, number> = {};
    for (const r of openingRows) {
      if (!pnIds.has(r.accountId)) continue;
      inicio[r.accountId] = expose(parseFloat(r.debit) - parseFloat(r.credit));
    }

    // 2. Reexpresión del patrimonio inicial → se incorpora a la fila de inicio,
    //    imputada a la cuenta destino (Capital social → Ajuste de capital).
    const [adjustment] = await db
      .select()
      .from(ajusteInflacion)
      .where(
        and(
          eq(ajusteInflacion.ejercicioId, fy.id),
          eq(ajusteInflacion.estado, 'aplicado')
        )
      )
      .limit(1);

    const reexpresionMovimientos: Record<string, number> = {};
    if (adjustment && view === 'ajustado') {
      const adjLines = await db
        .select({
          accountId: ajusteInflacionLinea.cuentaId,
          isOpening: ajusteInflacionLinea.esApertura,
          difference: ajusteInflacionLinea.diferencia,
        })
        .from(ajusteInflacionLinea)
        .where(eq(ajusteInflacionLinea.ajusteId, adjustment.id));

      const targetOf = new Map(
        pnAccounts.map((a) => [a.id, a.inflationTargetId ?? a.id])
      );
      for (const l of adjLines) {
        if (!pnIds.has(l.accountId)) continue;
        const target = targetOf.get(l.accountId) ?? l.accountId;
        const amount = expose(parseFloat(l.difference));
        if (l.isOpening) {
          inicio[target] = r2((inicio[target] ?? 0) + amount);
        } else {
          reexpresionMovimientos[target] = r2(
            (reexpresionMovimientos[target] ?? 0) + amount
          );
        }
      }
    }

    // 3. Movimientos del ejercicio en cuentas de PN, desglosados por asiento.
    const movementRows = await db
      .select({
        entryId: asiento.id,
        number: asiento.numero,
        entryDate: asiento.fecha,
        description: asiento.descripcion,
        accountId: asientoLinea.cuentaId,
        debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
        credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
      })
      .from(asientoLinea)
      .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
      .where(
        and(
          eq(asiento.ejercicioId, fy.id),
          eq(asiento.anulado, false),
          sql`${asiento.origenTipo} NOT IN ('apertura','cierre','ajuste_inflacion')`,
          inArray(asientoLinea.cuentaId, [...pnIds])
        )
      )
      .groupBy(
        asiento.id,
        asiento.numero,
        asiento.fecha,
        asiento.descripcion,
        asientoLinea.cuentaId
      )
      .orderBy(asc(asiento.numero));

    const movimientos = new Map<
      string,
      {
        number: number;
        entryDate: string;
        description: string | null;
        amounts: Record<string, number>;
      }
    >();
    for (const r of movementRows) {
      const amount = expose(parseFloat(r.debit) - parseFloat(r.credit));
      if (Math.abs(amount) < 0.005) continue;
      const prev = movimientos.get(r.entryId) ?? {
        number: r.number,
        entryDate: r.entryDate,
        description: r.description,
        amounts: {},
      };
      prev.amounts[r.accountId] = r2((prev.amounts[r.accountId] ?? 0) + amount);
      movimientos.set(r.entryId, prev);
    }

    // 4. Resultado del ejercicio: sale del ER ya ajustado.
    const balances = await computeEspBalances(orgId, fy.id, view);
    const resultado = r2(
      balances
        .filter(
          (b) =>
            b.group &&
            (RESULT_ACCOUNT_GROUPS as readonly string[]).includes(b.group)
        )
        .reduce((s, b) => s + expose(b.saldo), 0)
    );

    // 5. El resultado del ejercicio se expone en la columna de Resultados no
    //    asignados, que es donde lo lleva el modelo RT 9 (y donde lo acumula el
    //    papel de trabajo del estudio en la fila de totales).
    const rnaAccount =
      pnAccounts.find(
        (a) =>
          a.group === 'resultados_no_asignados' && inicio[a.id] !== undefined
      ) ?? pnAccounts.find((a) => a.group === 'resultados_no_asignados');
    const resultadoAmounts: Record<string, number> =
      rnaAccount && Math.abs(resultado) >= 0.005
        ? { [rnaAccount.id]: resultado }
        : {};

    // 6. Columnas: solo las cuentas con algún importe.
    const touched = new Set<string>([
      ...Object.keys(inicio),
      ...Object.keys(reexpresionMovimientos),
      ...Object.keys(resultadoAmounts),
      ...[...movimientos.values()].flatMap((m) => Object.keys(m.amounts)),
    ]);
    const accountColumns: EepnColumn[] = pnAccounts
      .filter((a) => touched.has(a.id))
      .map((a) => ({
        accountId: a.id,
        code: a.code,
        name: a.name,
        group: a.group ?? '',
        groupLabel: a.group ? (ACCOUNT_GROUP_LABELS[a.group] ?? a.group) : '',
        isSubtotal: false,
      }));

    // Cada rubro de más de una cuenta cierra con su subtotal. Los importes se
    // calculan acá, y no en cada vista, para que la pantalla, el PDF y el Excel
    // no puedan diferir entre sí.
    const columns: EepnColumn[] = [];
    const subtotalMembers = new Map<string, string[]>();
    for (let i = 0; i < accountColumns.length; i++) {
      const col = accountColumns[i];
      columns.push(col);
      const next = accountColumns[i + 1];
      if (next?.group === col.group) continue; // el rubro sigue
      const members = accountColumns
        .filter((c) => c.group === col.group)
        .map((c) => c.accountId);
      if (members.length < 2) continue;
      const key = `subtotal:${col.group}`;
      subtotalMembers.set(key, members);
      columns.push({
        accountId: key,
        code: '',
        name: 'Total',
        group: col.group,
        groupLabel: col.groupLabel,
        isSubtotal: true,
      });
    }

    /** Agrega a una fila los importes de las columnas de subtotal. */
    const withSubtotals = (amounts: Record<string, number>) => {
      const out = { ...amounts };
      for (const [key, members] of subtotalMembers) {
        out[key] = r2(members.reduce((s, id) => s + (amounts[id] ?? 0), 0));
      }
      return out;
    };

    // Suma solo las cuentas: incluir los subtotales duplicaría los importes.
    const sumRow = (amounts: Record<string, number>) =>
      r2(accountColumns.reduce((s, c) => s + (amounts[c.accountId] ?? 0), 0));

    const rows: EepnRow[] = [];
    rows.push({
      key: 'inicio',
      label: 'Saldos al inicio del ejercicio',
      kind: 'inicio',
      amounts: withSubtotals(inicio),
      total: sumRow(inicio),
    });

    for (const [entryId, m] of movimientos) {
      rows.push({
        key: `mov-${entryId}`,
        label: m.description ?? `Asiento N° ${m.number}`,
        kind: 'movimiento',
        amounts: withSubtotals(m.amounts),
        total: sumRow(m.amounts),
        entryNumber: m.number,
        entryDate: m.entryDate,
      });
    }

    if (Object.keys(reexpresionMovimientos).length > 0) {
      rows.push({
        key: 'reexpresion-movimientos',
        label: 'Reexpresión de los movimientos del ejercicio',
        kind: 'movimiento',
        amounts: withSubtotals(reexpresionMovimientos),
        total: sumRow(reexpresionMovimientos),
      });
    }

    rows.push({
      key: 'resultado',
      label: 'Resultado del ejercicio',
      kind: 'resultado',
      amounts: withSubtotals(resultadoAmounts),
      total: resultado,
    });

    // 7. Saldos al cierre = inicio + movimientos + resultado.
    const cierre: Record<string, number> = { ...inicio };
    const accumulate = (amounts: Record<string, number>) => {
      for (const [accountId, amount] of Object.entries(amounts)) {
        cierre[accountId] = r2((cierre[accountId] ?? 0) + amount);
      }
    };
    accumulate(reexpresionMovimientos);
    for (const m of movimientos.values()) accumulate(m.amounts);
    accumulate(resultadoAmounts);
    rows.push({
      key: 'cierre',
      label: 'Saldos al cierre del ejercicio',
      kind: 'cierre',
      amounts: withSubtotals(cierre),
      total: sumRow(cierre),
    });

    // 8. Comparativo: el ejercicio anterior en sus tres filas, reexpresado.
    let prior: { inicio: number; resultado: number; cierre: number } | null =
      null;
    let priorCoefficient: number | null = null;
    if (priorFy) {
      const priorBalances = await computeEspBalances(orgId, priorFy.id, view);
      const sumGroups = (groups: readonly string[]) =>
        r2(
          priorBalances
            .filter((b) => b.group && groups.includes(b.group))
            .reduce((s, b) => s + expose(b.saldo), 0)
        );
      const priorResultado = sumGroups(RESULT_ACCOUNT_GROUPS);
      const priorCierre = sumGroups([...PN_GROUPS, ...RESULT_ACCOUNT_GROUPS]);

      // El patrimonio al inicio de aquel ejercicio sale de su asiento de
      // apertura; si no lo tiene (primer ejercicio), se deduce por diferencia.
      const priorOpeningRows = await db
        .select({
          accountId: asientoLinea.cuentaId,
          debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
          credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
        })
        .from(asientoLinea)
        .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
        .where(
          and(
            eq(asiento.ejercicioId, priorFy.id),
            eq(asiento.anulado, false),
            eq(asiento.origenTipo, 'apertura')
          )
        )
        .groupBy(asientoLinea.cuentaId);
      const priorInicio = r2(
        priorOpeningRows
          .filter((r) => pnIds.has(r.accountId))
          .reduce(
            (s, r) => s + expose(parseFloat(r.debit) - parseFloat(r.credit)),
            0
          )
      );

      if (view === 'ajustado') {
        priorCoefficient = await priorColumnCoefficient(
          fy.fechaHasta,
          priorFy.fechaHasta
        );
      }
      const k = priorCoefficient ?? 1;
      prior = {
        inicio: r2(priorInicio * k),
        resultado: r2(priorResultado * k),
        cierre: r2(priorCierre * k),
      };
    }

    const espTotal = r2(
      balances
        .filter(
          (b) =>
            b.group &&
            (
              [...PN_GROUPS, ...RESULT_ACCOUNT_GROUPS] as readonly string[]
            ).includes(b.group)
        )
        .reduce((s, b) => s + expose(b.saldo), 0)
    );

    const fmtD = (d: string) =>
      `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

    const cierreTotal = rows[rows.length - 1].total;
    return {
      fiscalYearNumber: fy.numero,
      priorFiscalYearNumber: priorFy?.numero ?? null,
      periodLabel: `${fmtD(fy.fechaDesde)} – ${fmtD(fy.fechaHasta)}`,
      columns,
      rows,
      prior,
      priorCoefficient,
      espTotal,
      matchesEsp: Math.abs(cierreTotal - espTotal) < 0.05,
      inflationApplied: !!adjustment,
      priorInflationApplied: priorFy
        ? priorFiguresAreHomogeneous(
            priorFy,
            (await loadInflationStatus(priorFy.id)).applied
          )
        : true,
    };
  });

/* ── Estado de Flujo de Efectivo (EFE) — método directo — AXI-7 ── */

export interface EfeLine {
  accountId: string;
  code: string;
  name: string;
  current: number;
  prior: number;
}

export interface EfeActivity {
  key: CashFlowActivity;
  label: string;
  lines: EfeLine[];
  current: number;
  prior: number;
}

export interface EfeResult {
  fiscalYearNumber: number;
  priorFiscalYearNumber: number | null;
  periodLabel: string;
  hasPrior: boolean;
  /** Coeficiente con el que se reexpresó la columna anterior. null = quedó histórica. */
  priorCoefficient: number | null;
  /** Efectivo al inicio, ya reexpresado a moneda de cierre si la vista es ajustada. */
  efectivoInicio: { current: number; prior: number };
  efectivoInicioHistorico: number;
  /** Coeficiente con el que se reexpresó el efectivo inicial del ejercicio. */
  coeficienteInicio: number | null;
  efectivoCierre: { current: number; prior: number };
  variacion: { current: number; prior: number };
  activities: EfeActivity[];
  /**
   * Resultado por exposición a la inflación del efectivo: la pérdida (o
   * ganancia) de poder adquisitivo por haber mantenido efectivo. Ya viene
   * incluido como una línea dentro de actividades operativas; se expone acá
   * aparte solo para poder mostrarlo o cruzarlo, no para volver a sumarlo.
   */
  recpamEfectivo: { current: number; prior: number };
  totalCausas: { current: number; prior: number };
  cuadra: boolean;
  /** Cuentas que movieron efectivo pero no tienen actividad asignada. */
  sinActividad: { code: string; name: string }[];
  inflationApplied: boolean;
  /**
   * El ejercicio anterior tiene su propio ajuste aplicado. Si es false, sus
   * cifras están en moneda heterogénea y multiplicarlas por un coeficiente no
   * las homogeneiza: el comparativo es aproximado y hay que decirlo.
   */
  priorInflationApplied: boolean;
}

interface AccountLike {
  id: string;
  code: string;
  name: string;
  group: string | null;
  /** Actividad del EFE, ya en el vocabulario del módulo puro (operating/...). */
  activity: CashFlowActivity | null;
}

/** Cifras crudas del EFE de un ejercicio, antes de armar el comparativo. */
interface EfeComputed {
  efectivoInicioHistorico: number;
  efectivoInicio: number;
  efectivoCierre: number;
  coeficienteInicio: number | null;
  /** Flujo de efectivo por cuenta de contrapartida, ya reexpresado. */
  byAccount: Map<string, number>;
  sinActividad: Map<string, { code: string; name: string }>;
  inflationApplied: boolean;
}

/** Clave año-mes sin cero a la izquierda, p. ej. "2026-6". */
const efeMonthKey = (periodo: string) =>
  `${parseInt(periodo.slice(0, 4), 10)}-${parseInt(periodo.slice(5, 7), 10)}`;

/**
 * Calcula el flujo de efectivo de un ejercicio.
 *
 * Toma los asientos que tocan una cuenta de efectivo y usa **la contrapartida**
 * para clasificar el movimiento: si pagué un sueldo la causa es operativa, si
 * compré una máquina es de inversión. Como todo asiento cuadra, la suma de las
 * contrapartidas con signo invertido es exactamente el movimiento de efectivo,
 * así que no hay que prorratear nada.
 *
 * Se extrajo del handler para poder correrlo también sobre el ejercicio anterior
 * y armar la columna comparativa.
 */
async function computeEfe(
  orgId: string,
  fy: FiscalYearRow,
  view: 'ajustado' | 'historico',
  accById: Map<string, AccountLike>,
  cashIds: Set<string>
): Promise<EfeComputed> {
  const ajustado = view === 'ajustado';

  // Efectivo al inicio: del asiento de apertura.
  const openingRows = await db
    .select({
      accountId: asientoLinea.cuentaId,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .where(
      and(
        eq(asiento.ejercicioId, fy.id),
        eq(asiento.anulado, false),
        eq(asiento.origenTipo, 'apertura')
      )
    )
    .groupBy(asientoLinea.cuentaId);

  const efectivoInicioHistorico = r2(
    openingRows
      .filter((r) => cashIds.has(r.accountId))
      .reduce((s, r) => s + parseFloat(r.debit) - parseFloat(r.credit), 0)
  );

  // Efectivo al cierre: saldo del mayor. El efectivo es monetario, así que no
  // cambia entre la vista histórica y la ajustada.
  const balances = await computeEspBalances(orgId, fy.id, view);
  const efectivoCierre = r2(
    balances
      .filter((b) => cashIds.has(b.accountId))
      .reduce((s, b) => s + b.saldo, 0)
  );

  // Movimientos del ejercicio, por asiento y mes. El mes sale del período del
  // asiento (`periodo_contable.periodo`, primer día del mes).
  const lines = await db
    .select({
      entryId: asiento.id,
      periodo: periodoContable.periodo,
      accountId: asientoLinea.cuentaId,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .innerJoin(periodoContable, eq(periodoContable.id, asiento.periodoId))
    .where(
      and(
        eq(asiento.ejercicioId, fy.id),
        eq(asiento.anulado, false),
        sql`${asiento.origenTipo} NOT IN ('apertura','cierre','ajuste_inflacion')`
      )
    )
    .groupBy(asiento.id, periodoContable.periodo, asientoLinea.cuentaId);

  // Coeficientes por mes, si la vista es ajustada.
  const [adjustment] = await db
    .select()
    .from(ajusteInflacion)
    .where(
      and(
        eq(ajusteInflacion.ejercicioId, fy.id),
        eq(ajusteInflacion.estado, 'aplicado')
      )
    )
    .limit(1);

  const coefficients = new Map<string, number>();
  let coeficienteInicio: number | null = null;
  if (ajustado && adjustment) {
    const idx = await db
      .select()
      .from(indiceInflacion)
      .where(eq(indiceInflacion.fuente, adjustment.fuente));
    const byKey = new Map(
      idx.map((r) => [`${r.anio}-${r.mes}`, Number(r.valor)])
    );
    const closingIndex = byKey.get(
      `${adjustment.cierreAnio}-${adjustment.cierreMes}`
    );
    if (closingIndex) {
      for (const [key, value] of byKey) {
        if (value > 0) {
          coefficients.set(
            key,
            Math.round((closingIndex / value) * 10000) / 10000
          );
        }
      }
      coeficienteInicio =
        coefficients.get(
          `${adjustment.aperturaAnio}-${adjustment.aperturaMes}`
        ) ?? null;
    }
  }
  const coefOf = (periodo: string) =>
    coefficients.get(efeMonthKey(periodo)) ?? 1;

  // Solo interesan los asientos que tocan efectivo.
  const entriesWithCash = new Set(
    lines
      .filter(
        (l) =>
          cashIds.has(l.accountId) &&
          Math.abs(parseFloat(l.debit) - parseFloat(l.credit)) >= 0.005
      )
      .map((l) => l.entryId)
  );

  const byAccount = new Map<string, number>();
  const sinActividad = new Map<string, { code: string; name: string }>();
  for (const l of lines) {
    if (!entriesWithCash.has(l.entryId)) continue;
    if (cashIds.has(l.accountId)) continue;
    const delta = parseFloat(l.debit) - parseFloat(l.credit);
    if (Math.abs(delta) < 0.005) continue;
    const flow = -delta * (ajustado ? coefOf(l.periodo) : 1);
    byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + flow);
    const acc = accById.get(l.accountId);
    if (acc && !acc.activity) {
      sinActividad.set(acc.id, { code: acc.code, name: acc.name });
    }
  }

  return {
    efectivoInicioHistorico,
    efectivoInicio:
      ajustado && coeficienteInicio
        ? r2(efectivoInicioHistorico * coeficienteInicio)
        : efectivoInicioHistorico,
    efectivoCierre,
    coeficienteInicio,
    byAccount,
    sinActividad,
    inflationApplied: !!adjustment,
  };
}

/**
 * Estado de Flujo de Efectivo por método directo, comparativo.
 *
 * En la vista ajustada cada flujo se reexpresa por el coeficiente de su mes y el
 * efectivo inicial por el del cierre anterior. La diferencia entre la variación
 * real del efectivo y la suma de los flujos reexpresados es el **RECPAM del
 * efectivo**: la pérdida de poder adquisitivo por haber tenido plata quieta. Se
 * expone como una línea propia, que es lo que hace cerrar el estado.
 *
 * La columna del ejercicio anterior se calcula igual y después se reexpresa a la
 * moneda de cierre actual, como en el ESP y el ER.
 */
export const getEFE = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      view: z.enum(['ajustado', 'historico']).default('ajustado'),
    })
  )
  .handler(async (ctx): Promise<EfeResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId, view } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    const ajustado = view === 'ajustado';

    const priorFy = await loadPriorFiscalYear(clientId, fy);

    const accounts = await db
      .select({
        id: cuenta.id,
        code: cuenta.codigo,
        name: cuenta.nombre,
        group: cuenta.rubro,
        activity: cuenta.flujoEfectivo,
      })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${clientId})`
        )
      );
    // El enum de la base habla castellano; el módulo puro, inglés (D27).
    const accById = new Map<string, AccountLike>(
      accounts.map((a) => [
        a.id,
        {
          id: a.id,
          code: a.code,
          name: a.name,
          group: a.group,
          activity: a.activity ? CASH_FLOW_ACTIVITY_FROM_DB[a.activity] : null,
        },
      ])
    );
    const cashIds = new Set(
      accounts.filter((a) => isCashGroup(a.group)).map((a) => a.id)
    );

    const cur = await computeEfe(orgId, fy, view, accById, cashIds);
    const pri = priorFy
      ? await computeEfe(orgId, priorFy, view, accById, cashIds)
      : null;

    // El comparativo va a moneda de cierre actual, igual que en el ESP y el ER.
    let priorCoefficient: number | null = null;
    if (priorFy && ajustado) {
      priorCoefficient = await priorColumnCoefficient(
        fy.fechaHasta,
        priorFy.fechaHasta
      );
    }
    const k = priorCoefficient ?? 1;
    const pv = (n: number) => (pri ? r2(n * k) : 0);

    const activities: EfeActivity[] = CASH_FLOW_ACTIVITY_ORDER.map((key) => {
      const ids = new Set<string>([
        ...cur.byAccount.keys(),
        ...(pri ? pri.byAccount.keys() : []),
      ]);
      const rows: EfeLine[] = [];
      for (const accountId of ids) {
        const acc = accById.get(accountId);
        if (!acc) continue;
        const activity =
          acc.activity ?? defaultCashFlowActivity(acc.group) ?? 'operating';
        if (activity !== key) continue;
        const c = r2(cur.byAccount.get(accountId) ?? 0);
        const p = pv(pri?.byAccount.get(accountId) ?? 0);
        if (Math.abs(c) < 0.005 && Math.abs(p) < 0.005) continue;
        rows.push({
          accountId,
          code: acc.code,
          name: acc.name,
          current: c,
          prior: p,
        });
      }
      rows.sort((a, b) => a.code.localeCompare(b.code));
      return {
        key,
        label: CASH_FLOW_ACTIVITY_LABELS[key],
        lines: rows,
        current: r2(rows.reduce((s, r) => s + r.current, 0)),
        prior: r2(rows.reduce((s, r) => s + r.prior, 0)),
      };
    });

    const efectivoInicio = {
      current: cur.efectivoInicio,
      prior: pv(pri?.efectivoInicio ?? 0),
    };
    const efectivoCierre = {
      current: cur.efectivoCierre,
      prior: pv(pri?.efectivoCierre ?? 0),
    };
    const variacion = {
      current: r2(efectivoCierre.current - efectivoInicio.current),
      prior: r2(efectivoCierre.prior - efectivoInicio.prior),
    };
    const flujos = {
      current: r2(activities.reduce((s, a) => s + a.current, 0)),
      prior: r2(activities.reduce((s, a) => s + a.prior, 0)),
    };
    // Cierra por diferencia: es el efecto de la inflación sobre el efectivo.
    const recpamEfectivo = {
      current: ajustado ? r2(variacion.current - flujos.current) : 0,
      prior: ajustado && pri ? r2(variacion.prior - flujos.prior) : 0,
    };

    // El RECPAM se expone DENTRO de actividades operativas, no como una línea
    // suelta al pie. Es como lo presenta el estudio en sus balances y es lo que
    // hace que el flujo operativo sea comparable con el resultado del ejercicio.
    if (
      Math.abs(recpamEfectivo.current) >= 0.005 ||
      Math.abs(recpamEfectivo.prior) >= 0.005
    ) {
      const operativas = activities.find((a) => a.key === 'operating');
      if (operativas) {
        operativas.lines.push({
          accountId: 'recpam-efectivo',
          code: '',
          name: 'RECPAM',
          current: recpamEfectivo.current,
          prior: recpamEfectivo.prior,
        });
        operativas.current = r2(operativas.current + recpamEfectivo.current);
        operativas.prior = r2(operativas.prior + recpamEfectivo.prior);
      }
    }

    const totalCausas = {
      current: r2(activities.reduce((s, a) => s + a.current, 0)),
      prior: r2(activities.reduce((s, a) => s + a.prior, 0)),
    };

    const fmtD = (d: string) =>
      `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

    return {
      fiscalYearNumber: fy.numero,
      priorFiscalYearNumber: priorFy?.numero ?? null,
      periodLabel: `${fmtD(fy.fechaDesde)} – ${fmtD(fy.fechaHasta)}`,
      hasPrior: !!priorFy,
      priorCoefficient,
      efectivoInicio,
      efectivoInicioHistorico: cur.efectivoInicioHistorico,
      coeficienteInicio: cur.coeficienteInicio,
      efectivoCierre,
      variacion,
      activities,
      recpamEfectivo,
      totalCausas,
      cuadra: Math.abs(totalCausas.current - variacion.current) < 0.05,
      sinActividad: [...cur.sinActividad.values()],
      inflationApplied: cur.inflationApplied,
      priorInflationApplied:
        pri && priorFy
          ? priorFiguresAreHomogeneous(priorFy, pri.inflationApplied)
          : true,
    };
  });
