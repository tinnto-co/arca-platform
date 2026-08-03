/**
 * Server functions del módulo de Balances — Fase 1: Plan de cuentas.
 *
 * Multi-tenant: el plan base vive a nivel `organization`; la personalización
 * (overrides, cuentas custom) y todo lo contable vive a nivel `client` (empresa fiscal).
 * Toda query arranca con getSessionWithOrg() y filtra por orgId / clientId.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  account,
  accountOverride,
  accountingLog,
  accountingPeriod,
  accountantSignature,
  client,
  cmvAnnex,
  financialStatement,
  fiscalYear,
  fixedAsset,
  invoice,
  journalEntry,
  journalEntryLine,
  ledgerMappingRule,
  ledgerMappingRuleLine,
  representative,
  user,
  inflationIndex,
  inflationAdjustment,
  inflationAdjustmentLine,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
  ensureClientBelongsToOrg,
  loadFiscalYearForOrg,
} from '@/actions/helpers';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
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
} from '@/lib/accounting-labels';
import {
  buildEntryLines,
  computeInvoiceAmounts,
  normalizeDirection,
  selectRuleForInvoice,
  type RuleLike,
} from '@/lib/accounting-invoice-posting';
import {
  depreciationSnapshot,
  accumulatedDepreciation,
} from '@/lib/accounting-depreciation';
import { parentCodeOf } from '@/lib/accounting-base-chart';
import {
  CASH_FLOW_ACTIVITY_LABELS,
  CASH_FLOW_ACTIVITY_ORDER,
  defaultCashFlowActivity,
  isCashGroup,
  type CashFlowActivity,
} from '@/lib/accounting-cashflow';
import {
  planChartImport,
  type ExistingAccount,
  type PlannedAccount,
} from '@/lib/accounting-chart-import';

/* ───────────────────────────── Helpers ───────────────────────────── */

/** Solo el Owner del estudio configura el plan de cuentas. */
function assertOwner(role: string): void {
  if (role !== 'owner') {
    throw new Error(
      'Solo el Owner del estudio puede modificar el plan de cuentas'
    );
  }
}

type AccountRow = typeof account.$inferSelect;

/** Carga una cuenta validando que sea visible para (orgId, clientId). */
async function loadAccountForClient(
  accountId: string,
  orgId: string,
  clientId: string
): Promise<AccountRow> {
  const [row] = await db
    .select()
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  if (!row) throw new Error('Cuenta no encontrada');
  if (row.organizationId !== orgId) throw new Error('Cuenta no autorizada');
  if (row.scope === 'custom' && row.clientId !== clientId) {
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
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  if (!row) throw new Error('Cuenta no encontrada');
  if (row.organizationId !== orgId) throw new Error('Cuenta no autorizada');
  if (row.scope !== 'base')
    throw new Error('La cuenta no pertenece al plan base');
  return row;
}

/** Ejercicio fiscal vigente (no cerrado) de la empresa, o null. */
async function getCurrentFiscalYearId(
  clientId: string
): Promise<string | null> {
  const [fy] = await db
    .select({ id: fiscalYear.id })
    .from(fiscalYear)
    .where(
      and(
        eq(fiscalYear.clientId, clientId),
        inArray(fiscalYear.status, ['open', 'closing'])
      )
    )
    .orderBy(sql`${fiscalYear.number} desc`)
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
    eq(journalEntryLine.clientId, clientId),
    eq(journalEntryLine.accountId, accountId),
    eq(journalEntry.isVoided, false),
  ];
  if (fiscalYearId)
    conditions.push(eq(journalEntry.fiscalYearId, fiscalYearId));

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntryLine)
    .innerJoin(
      journalEntry,
      eq(journalEntry.id, journalEntryLine.journalEntryId)
    )
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
    .select({ code: account.code })
    .from(account)
    .where(
      and(
        eq(account.organizationId, orgId),
        eq(account.parentId, parent.id),
        sql`(${account.scope} = 'base' OR ${account.clientId} = ${clientId})`
      )
    );
  let max = CUSTOM_SEGMENT_START - 1;
  for (const s of siblings) {
    const seg = lastCodeSegment(s.code);
    if (seg > max) max = seg;
  }
  const next = max + 1;
  return `${parent.code}.${String(next).padStart(3, '0')}`;
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

/** Lista las empresas (client) del estudio para el selector del módulo. */
export const listAccountingClients = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();
    return db
      .select({
        id: client.id,
        name: client.name,
        identityNumber: client.identityNumber,
      })
      .from(client)
      .innerJoin(representative, eq(representative.id, client.representativeId))
      .where(eq(representative.organizationId, orgId))
      .orderBy(asc(client.name));
  }
);

export interface ChartAccount {
  id: string;
  scope: 'base' | 'custom';
  code: string;
  /** Nombre efectivo (override.customName si existe, si no el base). */
  name: string;
  /** Nombre base original (para mostrar el override y poder revertir). */
  baseName: string;
  isRenamed: boolean;
  description: string | null;
  type: 'imputable' | 'group';
  parentId: string | null;
  accountGroup: string | null;
  expectedBalance: string | null;
  expenseFunction: string | null;
  isSystemAccount: boolean;
  /** Estado efectivo para esta empresa (override.isActive ?? account.isActive). */
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
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    // Cuentas base del estudio + custom de la empresa.
    const accounts = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          sql`(${account.scope} = 'base' OR (${account.scope} = 'custom' AND ${account.clientId} = ${clientId}))`
        )
      )
      .orderBy(asc(account.code));

    // Overrides de la empresa.
    const overrides = await db
      .select()
      .from(accountOverride)
      .where(eq(accountOverride.clientId, clientId));
    const overrideByAccount = new Map(overrides.map((o) => [o.accountId, o]));

    // Cuentas con movimientos en el ejercicio actual.
    const currentFyId = await getCurrentFiscalYearId(clientId);
    const movementAccountIds = new Set<string>();
    if (currentFyId) {
      const rows = await db
        .selectDistinct({ accountId: journalEntryLine.accountId })
        .from(journalEntryLine)
        .innerJoin(
          journalEntry,
          eq(journalEntry.id, journalEntryLine.journalEntryId)
        )
        .where(
          and(
            eq(journalEntryLine.clientId, clientId),
            eq(journalEntry.fiscalYearId, currentFyId),
            eq(journalEntry.isVoided, false)
          )
        );
      for (const r of rows) movementAccountIds.add(r.accountId);
    }

    const result: ChartAccount[] = accounts.map((a) => {
      const ov = overrideByAccount.get(a.id);
      const isRenamed = a.scope === 'base' && !!ov?.customName;
      return {
        id: a.id,
        scope: a.scope,
        code: a.code,
        name: isRenamed ? ov.customName! : a.name,
        baseName: a.name,
        isRenamed,
        description: a.description,
        type: a.type,
        parentId: a.parentId,
        accountGroup: a.accountGroup,
        expectedBalance: a.expectedBalance,
        expenseFunction: a.expenseFunction,
        isSystemAccount: a.isSystemAccount,
        isActive:
          a.scope === 'base' ? (ov?.isActive ?? a.isActive) : a.isActive,
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
  .inputValidator(
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
 * - Cuentas base → se persiste como accountOverride (no toca a otras empresas).
 * - Cuentas custom → se actualiza la cuenta directamente.
 * - isSystemAccount no se puede desactivar.
 * - No se puede desactivar una cuenta con movimientos en el ejercicio actual.
 */
export const setAccountActive = createServerFn({ method: 'POST' })
  .inputValidator(
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
      if (acc.isSystemAccount) {
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

    if (acc.scope === 'custom') {
      await db
        .update(account)
        .set({ isActive })
        .where(eq(account.id, accountId));
    } else {
      await db
        .insert(accountOverride)
        .values({ clientId, accountId, isActive })
        .onConflictDoUpdate({
          target: [accountOverride.clientId, accountOverride.accountId],
          set: { isActive, updatedAt: new Date() },
        });
    }

    if (!isActive) {
      await db.insert(accountingLog).values({
        clientId,
        eventType: 'account_deactivated',
        eventData: { accountId, code: acc.code, scope: acc.scope },
        userId,
      });
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      name: z.string().min(1),
      type: z.enum(['imputable', 'group']),
      accountGroup: z.string().optional(),
      expectedBalance: z.enum(['debit', 'credit', 'both']).optional(),
      expenseFunction: z
        .enum(['administration', 'sales', 'financial', 'other'])
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
    if (parent.type !== 'group') {
      throw new Error('La cuenta padre debe ser una agrupación');
    }

    // Código autogenerado en el rango reservado, ordenado junto a sus hermanas.
    const code = await generateCustomChildCode(orgId, d.clientId, parent);

    // Chequeo de colisión defensivo (por si dos altas simultáneas).
    const [collision] = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.code, code),
          sql`(${account.scope} = 'base' OR ${account.clientId} = ${d.clientId})`
        )
      )
      .limit(1);
    if (collision) {
      throw new Error('No se pudo asignar un código libre. Reintentá');
    }

    const [created] = await db
      .insert(account)
      .values({
        scope: 'custom',
        organizationId: orgId,
        clientId: d.clientId,
        code,
        name: d.name.trim(),
        description: d.description?.trim() ? d.description.trim() : null,
        type: d.type,
        parentId: parent.id,
        accountGroup: (d.accountGroup ?? null) as never,
        expectedBalance: (d.expectedBalance ?? null) as never,
        expenseFunction: (d.expenseFunction ?? null) as never,
        isSystemAccount: false,
        isActive: true,
      })
      .returning();

    await db.insert(accountingLog).values({
      clientId: d.clientId,
      eventType: 'account_created',
      eventData: { accountId: created.id, code, scope: 'custom' },
      userId,
    });

    return created;
  });

/**
 * Renombra una cuenta del plan base solo para una empresa (override).  (US 1.1.4)
 */
export const renameBaseAccount = createServerFn({ method: 'POST' })
  .inputValidator(
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
    if (acc.isSystemAccount) {
      throw new Error('Las cuentas de sistema no se pueden renombrar');
    }

    await db
      .insert(accountOverride)
      .values({ clientId, accountId, customName: customName.trim() })
      .onConflictDoUpdate({
        target: [accountOverride.clientId, accountOverride.accountId],
        set: { customName: customName.trim(), updatedAt: new Date() },
      });

    return { ok: true };
  });

/**
 * Revierte el renombre de una cuenta base, volviendo al nombre del estudio.  (US 1.1.4)
 * Si el override solo servía para el renombre, se elimina la fila.
 */
export const revertBaseAccountRename = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .from(accountOverride)
      .where(
        and(
          eq(accountOverride.clientId, clientId),
          eq(accountOverride.accountId, accountId)
        )
      )
      .limit(1);
    if (!ov) return { ok: true };

    if (ov.isActive === null) {
      // El override solo guardaba el renombre → se elimina.
      await db.delete(accountOverride).where(eq(accountOverride.id, ov.id));
    } else {
      await db
        .update(accountOverride)
        .set({ customName: null, updatedAt: new Date() })
        .where(eq(accountOverride.id, ov.id));
    }
    return { ok: true };
  });

/* ─────────────────── Plan base del estudio (US 1.1.5) ─────────────────── */

/**
 * Agrega una cuenta al plan base del estudio. Aparece INACTIVA por default en
 * todas las empresas (se propaga por referencia, no por clonado).
 */
export const createBaseAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(['imputable', 'group']),
      accountGroup: z.string().optional(),
      expectedBalance: z.enum(['debit', 'credit', 'both']).optional(),
      expenseFunction: z
        .enum(['administration', 'sales', 'financial', 'other'])
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
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.scope, 'base'),
          eq(account.code, code)
        )
      )
      .limit(1);
    if (collision) throw new Error('Ese código ya existe en el plan base');

    // Si se cuelga de un padre: debe ser agrupación y el código tiene que
    // empezar con el del padre (evita jerarquías código↔padre inconsistentes).
    if (d.parentId) {
      const parent = await loadBaseAccount(d.parentId, orgId);
      if (parent.type !== 'group') {
        throw new Error('La cuenta padre debe ser una agrupación');
      }
      if (!code.startsWith(`${parent.code}.`)) {
        throw new Error(
          `El código debe empezar con el de la cuenta padre ("${parent.code}.")`
        );
      }
    }

    const [created] = await db
      .insert(account)
      .values({
        scope: 'base',
        organizationId: orgId,
        clientId: null,
        code,
        name: d.name.trim(),
        description: d.description?.trim() ? d.description.trim() : null,
        type: d.type,
        parentId: d.parentId ?? null,
        accountGroup: (d.accountGroup ?? null) as never,
        expectedBalance: (d.expectedBalance ?? null) as never,
        expenseFunction: (d.expenseFunction ?? null) as never,
        isSystemAccount: false,
        // Nueva cuenta base: inactiva por default en todas las empresas.
        isActive: false,
      })
      .returning();

    return created;
  });

/**
 * Edita una cuenta del plan base. Solo permitido si no tiene movimientos en
 * NINGUNA empresa (cambiar rubro/tipo post-movimientos corrompería los EECC).
 */
export const updateBaseAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      type: z.enum(['imputable', 'group']).optional(),
      accountGroup: z.string().optional(),
      expectedBalance: z.enum(['debit', 'credit', 'both']).optional(),
      expenseFunction: z
        .enum(['administration', 'sales', 'financial', 'other'])
        .nullable()
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const acc = await loadBaseAccount(ctx.data.id, orgId);
    if (acc.isSystemAccount) {
      throw new Error('Las cuentas de sistema no se pueden editar');
    }

    // Movimientos en cualquier empresa.
    const [mov] = await db
      .select({ id: journalEntryLine.id })
      .from(journalEntryLine)
      .where(eq(journalEntryLine.accountId, acc.id))
      .limit(1);
    if (mov) {
      throw new Error(
        'No se puede editar: la cuenta tiene movimientos en alguna empresa'
      );
    }

    const updates: Partial<typeof account.$inferInsert> = {};
    if (ctx.data.name !== undefined) updates.name = ctx.data.name.trim();
    if (ctx.data.description !== undefined)
      updates.description = ctx.data.description;
    if (ctx.data.type !== undefined) updates.type = ctx.data.type;
    if (ctx.data.accountGroup !== undefined)
      updates.accountGroup = ctx.data.accountGroup as never;
    if (ctx.data.expectedBalance !== undefined)
      updates.expectedBalance = ctx.data.expectedBalance;
    if (ctx.data.expenseFunction !== undefined) {
      updates.expenseFunction = ctx.data.expenseFunction;
    }

    const [updated] = await db
      .update(account)
      .set(updates)
      .where(eq(account.id, acc.id))
      .returning();
    return updated;
  });

/**
 * Borra una cuenta del plan base. No permitido si tiene movimientos en alguna
 * empresa o si tiene cuentas hijas.
 */
export const deleteBaseAccount = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const acc = await loadBaseAccount(ctx.data.id, orgId);
    if (acc.isSystemAccount) {
      throw new Error('Las cuentas de sistema no se pueden borrar');
    }

    const [mov] = await db
      .select({ id: journalEntryLine.id })
      .from(journalEntryLine)
      .where(eq(journalEntryLine.accountId, acc.id))
      .limit(1);
    if (mov) {
      throw new Error(
        'No se puede borrar: la cuenta tiene movimientos en alguna empresa'
      );
    }

    const [child] = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.parentId, acc.id))
      .limit(1);
    if (child) {
      throw new Error(
        'No se puede borrar: la cuenta tiene subcuentas. Borrá o reasigná las hijas primero'
      );
    }

    await db.delete(account).where(eq(account.id, acc.id));
    return { ok: true };
  });

/**
 * Borra una cuenta custom propia de la empresa.  (US 1.1.3)
 * No permitido si tiene movimientos en la empresa o si tiene subcuentas.
 */
export const deleteCustomAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), id: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { clientId, id } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const acc = await loadAccountForClient(id, orgId, clientId);
    if (acc.scope !== 'custom') {
      throw new Error('La cuenta no es una cuenta propia de la empresa');
    }

    const currentCount = await countMovements(clientId, id, null);
    if (currentCount > 0) {
      throw new Error(
        'No se puede borrar: la cuenta tiene movimientos en esta empresa'
      );
    }

    const [child] = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.parentId, id))
      .limit(1);
    if (child) {
      throw new Error(
        'No se puede borrar: la cuenta tiene subcuentas. Borrá o reasigná las hijas primero'
      );
    }

    await db.delete(account).where(eq(account.id, id));
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
  target: 'base' | 'custom'
): Promise<string | null> {
  if (target === 'base') {
    const [mov] = await db
      .select({ id: journalEntryLine.id })
      .from(journalEntryLine)
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(and(eq(account.organizationId, orgId), eq(account.scope, 'base')))
      .limit(1);
    if (mov) return 'ya hay asientos registrados sobre el plan base';

    const [custom] = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.organizationId, orgId), eq(account.scope, 'custom'))
      )
      .limit(1);
    if (custom) return 'existen cuentas propias de empresas colgadas del plan';

    const [ov] = await db
      .select({ id: accountOverride.id })
      .from(accountOverride)
      .innerJoin(account, eq(account.id, accountOverride.accountId))
      .where(and(eq(account.organizationId, orgId), eq(account.scope, 'base')))
      .limit(1);
    if (ov) return 'hay cuentas base activadas o renombradas en alguna empresa';
    return null;
  }

  // custom
  const [mov] = await db
    .select({ id: journalEntryLine.id })
    .from(journalEntryLine)
    .innerJoin(account, eq(account.id, journalEntryLine.accountId))
    .where(and(eq(account.clientId, clientId), eq(account.scope, 'custom')))
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      target: z.enum(['base', 'custom']),
      mode: z.enum(['complementar', 'reemplazar']),
      confirm: z.boolean(),
      /** Códigos de filas modificadas a aplicar (el resto se ignora). */
      applyUpdateCodes: z.array(z.string()).default([]),
      rows: z.array(
        z.object({
          row: z.number(),
          code: z.string(),
          name: z.string(),
          type: z.enum(['group', 'imputable']),
          accountGroup: z.string().nullish(),
          expectedBalance: z.enum(['debit', 'credit', 'both']).nullish(),
          expenseFunction: z
            .enum(['administration', 'sales', 'financial', 'other'])
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
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      accountGroup: account.accountGroup,
      expectedBalance: account.expectedBalance,
      expenseFunction: account.expenseFunction,
      description: account.description,
    };
    const baseAccounts = (await db
      .select(cols)
      .from(account)
      .where(
        and(eq(account.organizationId, orgId), eq(account.scope, 'base'))
      )) as AccountWithId[];
    const customAccounts =
      target === 'custom'
        ? ((await db
            .select(cols)
            .from(account)
            .where(
              and(eq(account.clientId, clientId), eq(account.scope, 'custom'))
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
          .delete(account)
          .where(
            and(
              eq(account.organizationId, orgId),
              eq(account.scope, 'base'),
              eq(account.isSystemAccount, false),
              sql`${account.code} <> '0' AND ${account.code} NOT LIKE '0.%'`
            )
          );
      } else {
        await db
          .delete(account)
          .where(
            and(eq(account.clientId, clientId), eq(account.scope, 'custom'))
          );
      }
    }

    // 2) Insertar las cuentas nuevas (1ra pasada, sin parentId).
    let created = 0;
    if (diff.create.length > 0) {
      const values = diff.create.map((a: PlannedAccount) => ({
        scope: target,
        organizationId: orgId,
        clientId: target === 'custom' ? clientId : null,
        code: a.code,
        name: a.name,
        description: a.description,
        type: a.type,
        parentId: null,
        accountGroup: (a.accountGroup ?? null) as never,
        expectedBalance: (a.expectedBalance ?? null) as never,
        expenseFunction: (a.expenseFunction ?? null) as never,
        isSystemAccount: false,
        isActive: target === 'custom',
      }));
      const ins = await db
        .insert(account)
        .values(values)
        .returning({ id: account.id, code: account.code });
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
        .select({ id: journalEntryLine.id })
        .from(journalEntryLine)
        .where(eq(journalEntryLine.accountId, accId))
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
        .update(account)
        .set({
          name: m.planned.name,
          description: m.planned.description,
          type: m.planned.type,
          accountGroup: (m.planned.accountGroup ?? null) as never,
          expectedBalance: m.planned.expectedBalance ?? null,
          expenseFunction: m.planned.expenseFunction ?? null,
        })
        .where(eq(account.id, accId));
      updated++;
    }

    // 4) 2da pasada: resolver parentId por código.
    const universe = (await db
      .select({ id: account.id, code: account.code })
      .from(account)
      .where(
        target === 'base'
          ? and(eq(account.organizationId, orgId), eq(account.scope, 'base'))
          : or(
              and(eq(account.organizationId, orgId), eq(account.scope, 'base')),
              and(eq(account.clientId, clientId), eq(account.scope, 'custom'))
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
      await db.update(account).set({ parentId }).where(eq(account.id, a.id));
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

type FiscalYearRow = typeof fiscalYear.$inferSelect;
type PeriodRow = typeof accountingPeriod.$inferSelect;

/** Valida que un período pertenezca al estudio y devuelve {period, fy}. */
async function loadPeriodForOrg(
  periodId: string,
  orgId: string
): Promise<{ period: PeriodRow; fy: FiscalYearRow }> {
  const [row] = await db
    .select({ period: accountingPeriod, fy: fiscalYear })
    .from(accountingPeriod)
    .innerJoin(fiscalYear, eq(fiscalYear.id, accountingPeriod.fiscalYearId))
    .innerJoin(client, eq(client.id, accountingPeriod.clientId))
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(
      and(
        eq(accountingPeriod.id, periodId),
        eq(representative.organizationId, orgId)
      )
    )
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
    .select({ count: sql<number>`count(distinct ${journalEntry.id})::int` })
    .from(journalEntry)
    .innerJoin(
      journalEntryLine,
      eq(journalEntryLine.journalEntryId, journalEntry.id)
    )
    .innerJoin(account, eq(account.id, journalEntryLine.accountId))
    .where(
      and(
        eq(journalEntry.periodId, periodId),
        eq(journalEntry.isVoided, false),
        eq(account.organizationId, orgId),
        eq(account.code, PENDING_REVIEW_CODE)
      )
    );
  return r?.count ?? 0;
}

/**
 * Crea un ejercicio fiscal de exactamente 12 meses calendario y sus 12 períodos
 * mensuales (todos abiertos). Solo puede haber un ejercicio abierto por empresa. (US 1.2.1)
 */
export const createFiscalYear = createServerFn({ method: 'POST' })
  .inputValidator(
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

    const start = new Date(`${ctx.data.startDate}T00:00:00Z`);
    const end = new Date(`${ctx.data.endDate}T00:00:00Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Fechas inválidas');
    }
    const sY = start.getUTCFullYear();
    const sM = start.getUTCMonth();
    if (start.getUTCDate() !== 1) {
      throw new Error('El ejercicio debe empezar el día 1 de un mes');
    }
    // El fin debe ser el último día de algún mes calendario.
    const eY = end.getUTCFullYear();
    const eM = end.getUTCMonth();
    const lastDayOfEndMonth = new Date(Date.UTC(eY, eM + 1, 0));
    if (end.getTime() !== lastDayOfEndMonth.getTime()) {
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
      .select({ id: fiscalYear.id })
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          inArray(fiscalYear.status, ['open', 'closing'])
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
        maxNum: sql<number>`coalesce(max(${fiscalYear.number}),0)::int`,
      })
      .from(fiscalYear)
      .where(eq(fiscalYear.clientId, clientId));
    const number = (maxNum ?? 0) + 1;

    const [fy] = await db
      .insert(fiscalYear)
      .values({
        clientId,
        startDate: start,
        endDate: end,
        status: 'open',
        number,
      })
      .returning();

    const periods = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(sY, sM + i, 1));
      return {
        fiscalYearId: fy.id,
        clientId,
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        status: 'open' as const,
      };
    });
    await db.insert(accountingPeriod).values(periods);

    return fy;
  });

/** Lista los ejercicios de una empresa con su resumen de períodos cerrados. */
export const getFiscalYears = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const years = await db
      .select()
      .from(fiscalYear)
      .where(eq(fiscalYear.clientId, ctx.data.clientId))
      .orderBy(desc(fiscalYear.number));

    const counts = await db
      .select({
        fiscalYearId: accountingPeriod.fiscalYearId,
        total: sql<number>`count(*)::int`,
        closed: sql<number>`(count(*) filter (where ${accountingPeriod.status} = 'closed'))::int`,
      })
      .from(accountingPeriod)
      .where(eq(accountingPeriod.clientId, ctx.data.clientId))
      .groupBy(accountingPeriod.fiscalYearId);
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
  status: 'open' | 'closed';
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
  .inputValidator(z.object({ fiscalYearId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const periods = await db
      .select()
      .from(accountingPeriod)
      .where(eq(accountingPeriod.fiscalYearId, fy.id))
      .orderBy(asc(accountingPeriod.year), asc(accountingPeriod.month));

    const stats = await db
      .select({
        periodId: journalEntry.periodId,
        entryCount: sql<number>`count(distinct ${journalEntry.id})::int`,
        totalDebit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      })
      .from(journalEntry)
      .leftJoin(
        journalEntryLine,
        eq(journalEntryLine.journalEntryId, journalEntry.id)
      )
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false)
        )
      )
      .groupBy(journalEntry.periodId);
    const byPeriod = new Map(stats.map((s) => [s.periodId, s]));

    // Asientos pendientes de revisión por período (bloquean el cierre).
    const pendingStats = await db
      .select({
        periodId: journalEntry.periodId,
        pendingCount: sql<number>`count(distinct ${journalEntry.id})::int`,
      })
      .from(journalEntry)
      .innerJoin(
        journalEntryLine,
        eq(journalEntryLine.journalEntryId, journalEntry.id)
      )
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          eq(account.organizationId, orgId),
          eq(account.code, PENDING_REVIEW_CODE)
        )
      )
      .groupBy(journalEntry.periodId);
    const pendingByPeriod = new Map(
      pendingStats.map((s) => [s.periodId, s.pendingCount])
    );

    // Período actual = el abierto más antiguo.
    const currentPeriod = periods.find((p) => p.status === 'open');

    const periodsOut: PeriodView[] = periods.map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      status: p.status,
      closedAt: p.closedAt,
      entryCount: byPeriod.get(p.id)?.entryCount ?? 0,
      totalAmount: parseFloat(byPeriod.get(p.id)?.totalDebit ?? '0'),
      pendingCount: pendingByPeriod.get(p.id) ?? 0,
      isCurrent: currentPeriod?.id === p.id,
    }));

    return {
      fiscalYear: fy,
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
  periodStatus: 'open' | 'closed';
}

/**
 * Bandeja de asientos en pendiente de revisión: asientos no anulados con al menos
 * una línea en la cuenta de sistema pending_review, a resolver antes de cerrar. (US 3.4.1)
 */
export const getPendingReviewEntries = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx): Promise<PendingReviewEntry[]> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const prId = await loadPendingReviewAccountId(orgId);

    // Líneas en pendiente de revisión + datos de su asiento y período.
    const prLines = await db
      .select({
        entryId: journalEntry.id,
        number: journalEntry.number,
        entryDate: journalEntry.entryDate,
        origin: journalEntry.origin,
        sourceType: journalEntry.sourceType,
        periodId: journalEntry.periodId,
        periodYear: accountingPeriod.year,
        periodMonth: accountingPeriod.month,
        periodStatus: accountingPeriod.status,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        description: journalEntryLine.description,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .innerJoin(
        accountingPeriod,
        eq(accountingPeriod.id, journalEntry.periodId)
      )
      .where(
        and(
          eq(journalEntry.clientId, clientId),
          eq(journalEntry.isVoided, false),
          eq(journalEntryLine.accountId, prId)
        )
      )
      .orderBy(desc(journalEntry.entryDate), desc(journalEntry.number));

    if (prLines.length === 0) return [];

    // Total del asiento (suma del Debe de TODAS sus líneas).
    const entryIds = [...new Set(prLines.map((l) => l.entryId))];
    const totals = await db
      .select({
        entryId: journalEntryLine.journalEntryId,
        total: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      })
      .from(journalEntryLine)
      .where(inArray(journalEntryLine.journalEntryId, entryIds))
      .groupBy(journalEntryLine.journalEntryId);
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
          periodYear: l.periodYear,
          periodMonth: l.periodMonth,
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
  .inputValidator(z.object({ periodId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { period, fy } = await loadPeriodForOrg(ctx.data.periodId, orgId);
    if (fy.status === 'closed') throw new Error('El ejercicio está cerrado');
    if (period.status === 'closed')
      throw new Error('El período ya está cerrado');

    const [earliest] = await db
      .select({ id: accountingPeriod.id })
      .from(accountingPeriod)
      .where(
        and(
          eq(accountingPeriod.fiscalYearId, fy.id),
          eq(accountingPeriod.status, 'open')
        )
      )
      .orderBy(asc(accountingPeriod.year), asc(accountingPeriod.month))
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
      .update(accountingPeriod)
      .set({ status: 'closed', closedAt: new Date(), closedBy: userId })
      .where(eq(accountingPeriod.id, period.id));

    await db.insert(accountingLog).values({
      clientId: period.clientId,
      fiscalYearId: fy.id,
      eventType: 'period_closed',
      eventData: {
        periodId: period.id,
        year: period.year,
        month: period.month,
      },
      userId,
    });

    return { ok: true };
  });

/**
 * Reabre un período cerrado con motivo obligatorio. Los asientos se conservan.
 * Registra en el log con usuario, fecha y motivo. (US 1.2.4)
 */
export const reopenPeriod = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ periodId: z.string().uuid(), reason: z.string().trim().min(1) })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const { period, fy } = await loadPeriodForOrg(ctx.data.periodId, orgId);
    if (fy.status === 'closed') {
      throw new Error('El ejercicio está cerrado. Reabrí el ejercicio primero');
    }
    if (period.status !== 'closed')
      throw new Error('El período no está cerrado');

    await db
      .update(accountingPeriod)
      .set({ status: 'open', closedAt: null, closedBy: null })
      .where(eq(accountingPeriod.id, period.id));

    await db.insert(accountingLog).values({
      clientId: period.clientId,
      fiscalYearId: fy.id,
      eventType: 'period_reopened',
      eventData: {
        periodId: period.id,
        year: period.year,
        month: period.month,
        reason: ctx.data.reason.trim(),
      },
      userId,
    });

    return { ok: true };
  });

/** Log auditable de cierres/reaperturas de un ejercicio. */
export const getAccountingLog = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ fiscalYearId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    return db
      .select({
        id: accountingLog.id,
        eventType: accountingLog.eventType,
        eventData: sql<{
          periodId?: string;
          year?: number;
          month?: number;
          reason?: string;
        } | null>`${accountingLog.eventData}`,
        createdAt: accountingLog.createdAt,
        userName: user.name,
        userEmail: user.email,
      })
      .from(accountingLog)
      .leftJoin(user, eq(user.id, accountingLog.userId))
      .where(
        and(
          eq(accountingLog.fiscalYearId, fy.id),
          // Esta vista es solo el historial de cierres/reaperturas; no eventos de asientos.
          inArray(accountingLog.eventType, [
            'period_closed',
            'period_reopened',
            'fiscal_year_closed',
            'fiscal_year_reopened',
          ])
        )
      )
      .orderBy(desc(accountingLog.createdAt));
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
  'inflation_adjustment_applied',
  'inflation_adjustment_voided',
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
  .inputValidator(
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
        id: accountingLog.id,
        eventType: accountingLog.eventType,
        eventData: accountingLog.eventData,
        createdAt: accountingLog.createdAt,
        userName: user.name,
        userEmail: user.email,
      })
      .from(accountingLog)
      .leftJoin(user, eq(user.id, accountingLog.userId))
      .where(
        and(
          eq(accountingLog.clientId, clientId),
          inArray(accountingLog.eventType, types)
        )
      )
      .orderBy(desc(accountingLog.createdAt))
      .limit(ctx.data.limit ?? 300);

    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      eventData: (r.eventData as AuditEventData) ?? null,
      createdAt: r.createdAt.toISOString(),
      userName: r.userName ?? null,
      userEmail: r.userEmail ?? null,
    }));
  });

/* ═══════════════════ ASIENTOS / LIBRO DIARIO (US 1.3.x) ═══════════════════ */

type JournalEntryRow = typeof journalEntry.$inferSelect;

/** Valida que un asiento pertenezca al estudio y lo devuelve. */
async function loadJournalEntryForOrg(
  entryId: string,
  orgId: string
): Promise<JournalEntryRow> {
  const [row] = await db
    .select({ je: journalEntry })
    .from(journalEntry)
    .innerJoin(client, eq(client.id, journalEntry.clientId))
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(
      and(
        eq(journalEntry.id, entryId),
        eq(representative.organizationId, orgId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Asiento no encontrado o no autorizado');
  return row.je;
}

/** Resuelve el ejercicio y período mensual al que cae una fecha (YYYY-MM-DD). */
async function resolvePeriodForDate(clientId: string, dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(date.getTime())) throw new Error('Fecha inválida');
  const [fy] = await db
    .select()
    .from(fiscalYear)
    .where(
      and(
        eq(fiscalYear.clientId, clientId),
        lte(fiscalYear.startDate, date),
        gte(fiscalYear.endDate, date)
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
    .from(accountingPeriod)
    .where(
      and(
        eq(accountingPeriod.fiscalYearId, fy.id),
        eq(accountingPeriod.year, date.getUTCFullYear()),
        eq(accountingPeriod.month, date.getUTCMonth() + 1)
      )
    )
    .limit(1);
  if (!period) throw new Error('No existe el período para esa fecha');
  return { fy, period, date };
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
    .from(account)
    .where(and(eq(account.organizationId, orgId), inArray(account.id, ids)));
  const overrides = await db
    .select()
    .from(accountOverride)
    .where(
      and(
        eq(accountOverride.clientId, clientId),
        inArray(accountOverride.accountId, ids)
      )
    );
  const ovMap = new Map(overrides.map((o) => [o.accountId, o]));
  const byId = new Map(accs.map((a) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a)
      throw new Error('Una de las cuentas no existe o no pertenece al estudio');
    if (a.scope === 'custom' && a.clientId !== clientId) {
      throw new Error('Una de las cuentas es custom de otra empresa');
    }
    if (a.type !== 'imputable') {
      throw new Error(
        `La cuenta ${a.code} es de agrupación; solo se imputan cuentas imputables`
      );
    }
    const active = ovMap.get(id)?.isActive ?? a.isActive;
    if (!active)
      throw new Error(`La cuenta ${a.code} está inactiva para esta empresa`);
  }
}

/** Cuentas imputables y activas de la empresa, para el selector de líneas del asiento. */
export const getPostableAccounts = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const accounts = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.type, 'imputable'),
          sql`(${account.scope} = 'base' OR (${account.scope} = 'custom' AND ${account.clientId} = ${ctx.data.clientId}))`
        )
      )
      .orderBy(asc(account.code));

    const overrides = await db
      .select()
      .from(accountOverride)
      .where(eq(accountOverride.clientId, ctx.data.clientId));
    const ovMap = new Map(overrides.map((o) => [o.accountId, o]));

    return accounts
      .filter((a) => ovMap.get(a.id)?.isActive ?? a.isActive)
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: ovMap.get(a.id)?.customName ?? a.name,
        accountGroup: a.accountGroup,
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
  .inputValidator(
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
    if (fy.status === 'closed') {
      throw new Error(
        'No se puede cargar el asiento: el ejercicio está cerrado'
      );
    }
    if (period.status === 'closed') {
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
          maxNum: sql<number>`coalesce(max(${journalEntry.number}),0)::int`,
        })
        .from(journalEntry)
        .where(
          and(
            eq(journalEntry.clientId, clientId),
            eq(journalEntry.fiscalYearId, fy.id)
          )
        );
      const number = (maxNum ?? 0) + 1;

      const [je] = await tx
        .insert(journalEntry)
        .values({
          clientId,
          fiscalYearId: fy.id,
          periodId: period.id,
          number,
          entryDate: date,
          description: ctx.data.description?.trim()
            ? ctx.data.description.trim()
            : null,
          origin: 'manual',
          createdBy: userId,
        })
        .returning();

      await tx.insert(journalEntryLine).values(
        ctx.data.lines.map((l, i) => ({
          journalEntryId: je.id,
          accountId: l.accountId,
          clientId,
          periodId: period.id,
          debit: String(l.debit),
          credit: String(l.credit),
          description: l.description?.trim() ? l.description.trim() : null,
          lineOrder: i,
        }))
      );
      return je;
    });

    return entry;
  });

/** Edita un asiento (solo si su período está abierto). (US 1.3.2) */
export const updateJournalEntry = createServerFn({ method: 'POST' })
  .inputValidator(
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
    if (entry.isVoided)
      throw new Error('No se puede editar un asiento anulado');

    // El período actual del asiento debe estar abierto.
    const { period: currentPeriod } = await loadPeriodForOrg(
      entry.periodId,
      orgId
    );
    if (currentPeriod.status === 'closed') {
      throw new Error(
        'No se puede editar: el período del asiento está cerrado'
      );
    }

    // Resolver el período de la (posible nueva) fecha; debe ser del mismo ejercicio y abierto.
    const { fy, period, date } = await resolvePeriodForDate(
      entry.clientId,
      ctx.data.entryDate
    );
    if (fy.id !== entry.fiscalYearId) {
      throw new Error(
        'La fecha debe estar dentro del mismo ejercicio del asiento'
      );
    }
    if (period.status === 'closed') {
      throw new Error('No se puede mover el asiento a un período cerrado');
    }

    validateLineAmounts(ctx.data.lines);
    await assertPostableAccounts(
      entry.clientId,
      orgId,
      ctx.data.lines.map((l) => l.accountId)
    );

    await db.transaction(async (tx) => {
      await tx
        .update(journalEntry)
        .set({
          entryDate: date,
          periodId: period.id,
          description: ctx.data.description?.trim()
            ? ctx.data.description.trim()
            : null,
          // Si era un asiento auto (factura/sueldos), marcarlo como editado a mano:
          // la regeneración posterior pedirá confirmación antes de sobreescribir.
          isEditedPostGeneration:
            entry.origin === 'manual' ? entry.isEditedPostGeneration : true,
        })
        .where(eq(journalEntry.id, entry.id));
      await tx
        .delete(journalEntryLine)
        .where(eq(journalEntryLine.journalEntryId, entry.id));
      await tx.insert(journalEntryLine).values(
        ctx.data.lines.map((l, i) => ({
          journalEntryId: entry.id,
          accountId: l.accountId,
          clientId: entry.clientId,
          periodId: period.id,
          debit: String(l.debit),
          credit: String(l.credit),
          description: l.description?.trim() ? l.description.trim() : null,
          lineOrder: i,
        }))
      );
      await tx.insert(accountingLog).values({
        clientId: entry.clientId,
        fiscalYearId: entry.fiscalYearId,
        eventType: 'journal_entry_edited',
        eventData: { entryId: entry.id, number: entry.number },
        userId,
      });
    });

    return { ok: true };
  });

/** Anula un asiento sin borrarlo, conservando su número. (US 1.3.3) */
export const voidJournalEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(1) })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const entry = await loadJournalEntryForOrg(ctx.data.id, orgId);
    if (entry.isVoided) throw new Error('El asiento ya está anulado');
    const { period } = await loadPeriodForOrg(entry.periodId, orgId);
    if (period.status === 'closed') {
      throw new Error(
        'No se puede anular: el período del asiento está cerrado'
      );
    }

    await db
      .update(journalEntry)
      .set({
        isVoided: true,
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: ctx.data.reason.trim(),
      })
      .where(eq(journalEntry.id, entry.id));

    await db.insert(accountingLog).values({
      clientId: entry.clientId,
      fiscalYearId: entry.fiscalYearId,
      eventType: 'journal_entry_voided',
      eventData: {
        entryId: entry.id,
        number: entry.number,
        reason: ctx.data.reason.trim(),
      },
      userId,
    });

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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      accountId: z.string().uuid().optional(),
      origin: z
        .enum([
          'manual',
          'auto_invoice',
          'auto_payroll',
          'auto_closing',
          'auto_opening',
          'import_excel',
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
        .select({ id: fiscalYear.id })
        .from(fiscalYear)
        .where(eq(fiscalYear.clientId, d.clientId))
        .orderBy(
          sql`case when ${fiscalYear.status} = 'open' then 0 else 1 end`,
          desc(fiscalYear.number)
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
      eq(journalEntry.clientId, d.clientId),
      eq(journalEntry.fiscalYearId, fyId),
    ];
    if (!d.includeVoided) conditions.push(eq(journalEntry.isVoided, false));
    if (d.origin) conditions.push(eq(journalEntry.origin, d.origin));
    if (d.from)
      conditions.push(
        gte(journalEntry.entryDate, new Date(`${d.from}T00:00:00Z`))
      );
    if (d.to)
      conditions.push(
        lte(journalEntry.entryDate, new Date(`${d.to}T00:00:00Z`))
      );

    if (d.accountId) {
      const lineEntries = await db
        .selectDistinct({ id: journalEntryLine.journalEntryId })
        .from(journalEntryLine)
        .where(
          and(
            eq(journalEntryLine.clientId, d.clientId),
            eq(journalEntryLine.accountId, d.accountId)
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
      conditions.push(inArray(journalEntry.id, ids));
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(journalEntry)
      .where(and(...conditions));

    const orderCol =
      d.sortBy === 'date' ? journalEntry.entryDate : journalEntry.number;
    const rows = await db
      .select({
        id: journalEntry.id,
        number: journalEntry.number,
        entryDate: journalEntry.entryDate,
        description: journalEntry.description,
        origin: journalEntry.origin,
        isVoided: journalEntry.isVoided,
      })
      .from(journalEntry)
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
          journalEntryId: journalEntryLine.journalEntryId,
          total: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(journalEntryLine)
        .where(inArray(journalEntryLine.journalEntryId, pageIds))
        .groupBy(journalEntryLine.journalEntryId);
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
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const entry = await loadJournalEntryForOrg(ctx.data.id, orgId);

    const [meta] = await db
      .select({
        fyNumber: fiscalYear.number,
        periodYear: accountingPeriod.year,
        periodMonth: accountingPeriod.month,
        periodStatus: accountingPeriod.status,
        createdByName: user.name,
        createdByEmail: user.email,
      })
      .from(journalEntry)
      .leftJoin(fiscalYear, eq(fiscalYear.id, journalEntry.fiscalYearId))
      .leftJoin(
        accountingPeriod,
        eq(accountingPeriod.id, journalEntry.periodId)
      )
      .leftJoin(user, eq(user.id, journalEntry.createdBy))
      .where(eq(journalEntry.id, entry.id))
      .limit(1);

    const lines = await db
      .select({
        id: journalEntryLine.id,
        accountId: journalEntryLine.accountId,
        accountCode: account.code,
        accountName: account.name,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        description: journalEntryLine.description,
        lineOrder: journalEntryLine.lineOrder,
      })
      .from(journalEntryLine)
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(eq(journalEntryLine.journalEntryId, entry.id))
      .orderBy(asc(journalEntryLine.lineOrder));

    const logRows = await db
      .select({
        id: accountingLog.id,
        eventType: accountingLog.eventType,
        eventData: sql<{ reason?: string } | null>`${accountingLog.eventData}`,
        createdAt: accountingLog.createdAt,
        userName: user.name,
        userEmail: user.email,
      })
      .from(accountingLog)
      .leftJoin(user, eq(user.id, accountingLog.userId))
      .where(
        and(
          eq(accountingLog.clientId, entry.clientId),
          inArray(accountingLog.eventType, [
            'journal_entry_edited',
            'journal_entry_voided',
          ]),
          sql`${accountingLog.eventData}->>'entryId' = ${entry.id}`
        )
      )
      .orderBy(desc(accountingLog.createdAt));

    // Comprobante origen (si el asiento vino de una factura) y regla aplicada. (US 1.3.5)
    let source: {
      kind: 'invoice';
      id: string;
      label: string;
      counterparty: string;
      amount: number;
    } | null = null;
    if (entry.sourceType === 'invoice' && entry.sourceId) {
      const [inv] = await db
        .select({
          id: invoice.id,
          type: invoice.type,
          salePoint: invoice.salePoint,
          idFrom: invoice.idFrom,
          direction: invoice.direction,
          emitterName: invoice.emitterName,
          recipientName: invoice.recipientName,
          amount: invoice.amount,
        })
        .from(invoice)
        .where(eq(invoice.id, entry.sourceId))
        .limit(1);
      if (inv) {
        const pv = String(inv.salePoint).padStart(5, '0');
        const nro = String(inv.idFrom).padStart(8, '0');
        source = {
          kind: 'invoice',
          id: inv.id,
          label: `Factura ${inv.type} ${pv}-${nro}`,
          counterparty:
            normalizeDirection(inv.direction) === 'purchase'
              ? inv.emitterName
              : inv.recipientName,
          amount: parseFloat(inv.amount),
        };
      }
    }

    let rule: { id: string; name: string } | null = null;
    if (entry.mappingRuleId) {
      const [r] = await db
        .select({ id: ledgerMappingRule.id, name: ledgerMappingRule.name })
        .from(ledgerMappingRule)
        .where(eq(ledgerMappingRule.id, entry.mappingRuleId))
        .limit(1);
      if (r) rule = r;
    }

    return {
      entry: {
        ...entry,
        fyNumber: meta?.fyNumber ?? null,
        periodYear: meta?.periodYear ?? null,
        periodMonth: meta?.periodMonth ?? null,
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
    .from(fiscalYear)
    .where(eq(fiscalYear.clientId, clientId))
    .orderBy(
      sql`case when ${fiscalYear.status} = 'open' then 0 else 1 end`,
      desc(fiscalYear.number)
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      accountId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      origin: z
        .enum([
          'manual',
          'auto_invoice',
          'auto_payroll',
          'auto_closing',
          'auto_opening',
          'import_excel',
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

    const fromDate = d.from ? new Date(`${d.from}T00:00:00Z`) : fy.startDate;
    const toDate = d.to ? new Date(`${d.to}T00:00:00Z`) : fy.endDate;

    // Saldo inicial = neto acumulado antes de `fromDate` dentro del ejercicio.
    const [si] = await db
      .select({
        d: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        h: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntryLine.clientId, d.clientId),
          eq(journalEntryLine.accountId, d.accountId),
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          lt(journalEntry.entryDate, fromDate)
        )
      );
    const saldoInicial = parseFloat(si.d) - parseFloat(si.h);

    const conds = [
      eq(journalEntryLine.clientId, d.clientId),
      eq(journalEntryLine.accountId, d.accountId),
      eq(journalEntry.fiscalYearId, fy.id),
      eq(journalEntry.isVoided, false),
      gte(journalEntry.entryDate, fromDate),
      lte(journalEntry.entryDate, toDate),
    ];
    if (d.origin) conds.push(eq(journalEntry.origin, d.origin));

    const raw = await db
      .select({
        entryId: journalEntry.id,
        number: journalEntry.number,
        entryDate: journalEntry.entryDate,
        description: journalEntry.description,
        origin: journalEntry.origin,
        lineDescription: journalEntryLine.description,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        lineOrder: journalEntryLine.lineOrder,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(and(...conds))
      .orderBy(
        asc(journalEntry.entryDate),
        asc(journalEntry.number),
        asc(journalEntryLine.lineOrder)
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
      account: { id: acc.id, code: acc.code, name: acc.name },
      fiscalYear: { id: fy.id, number: fy.number },
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      origin: z
        .enum([
          'manual',
          'auto_invoice',
          'auto_payroll',
          'auto_closing',
          'auto_opening',
          'import_excel',
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
        fiscalYear: null,
        accounts: [],
        grandTotalDebit: 0,
        grandTotalCredit: 0,
      };
    }

    const fromDate = d.from ? new Date(`${d.from}T00:00:00Z`) : fy.startDate;
    const toDate = d.to ? new Date(`${d.to}T00:00:00Z`) : fy.endDate;

    // Saldos iniciales por cuenta (antes de fromDate).
    const initials = await db
      .select({
        accountId: journalEntryLine.accountId,
        d: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        h: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntryLine.clientId, d.clientId),
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          lt(journalEntry.entryDate, fromDate)
        )
      )
      .groupBy(journalEntryLine.accountId);
    const initialByAccount = new Map(
      initials.map((i) => [i.accountId, parseFloat(i.d) - parseFloat(i.h)])
    );

    const conds = [
      eq(journalEntryLine.clientId, d.clientId),
      eq(journalEntry.fiscalYearId, fy.id),
      eq(journalEntry.isVoided, false),
      gte(journalEntry.entryDate, fromDate),
      lte(journalEntry.entryDate, toDate),
    ];
    if (d.origin) conds.push(eq(journalEntry.origin, d.origin));

    const raw = await db
      .select({
        accountId: journalEntryLine.accountId,
        code: account.code,
        name: account.name,
        entryId: journalEntry.id,
        number: journalEntry.number,
        entryDate: journalEntry.entryDate,
        description: journalEntry.description,
        origin: journalEntry.origin,
        lineDescription: journalEntryLine.description,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        lineOrder: journalEntryLine.lineOrder,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(and(...conds))
      .orderBy(
        asc(account.code),
        asc(journalEntry.entryDate),
        asc(journalEntry.number),
        asc(journalEntryLine.lineOrder)
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
        .select({ id: account.id, code: account.code, name: account.name })
        .from(account)
        .where(
          inArray(
            account.id,
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
      fiscalYear: { id: fy.id, number: fy.number },
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
  .inputValidator(
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

    const corte = d.asOf ? new Date(`${d.asOf}T00:00:00Z`) : fy.endDate;

    const raw = await db
      .select({
        accountId: journalEntryLine.accountId,
        code: account.code,
        name: account.name,
        d: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        h: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(
        and(
          eq(journalEntryLine.clientId, d.clientId),
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          lte(journalEntry.entryDate, corte)
        )
      )
      .groupBy(journalEntryLine.accountId, account.code, account.name)
      .orderBy(asc(account.code));

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
      fiscalYear: { id: fy.id, number: fy.number },
      fiscalYearStart: fy.startDate,
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
  .inputValidator(
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
      .select({ name: client.name, cuit: client.identityNumber })
      .from(client)
      .where(eq(client.id, clientId))
      .limit(1);

    const entries = await db
      .select({
        id: journalEntry.id,
        number: journalEntry.number,
        entryDate: journalEntry.entryDate,
        description: journalEntry.description,
        origin: journalEntry.origin,
        isVoided: journalEntry.isVoided,
        voidReason: journalEntry.voidReason,
      })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.clientId, clientId),
          eq(journalEntry.fiscalYearId, fy.id)
        )
      )
      .orderBy(asc(journalEntry.number));

    const lineRows = await db
      .select({
        entryId: journalEntryLine.journalEntryId,
        accountCode: account.code,
        accountName: account.name,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        description: journalEntryLine.description,
        lineOrder: journalEntryLine.lineOrder,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(
        and(
          eq(journalEntry.clientId, clientId),
          eq(journalEntry.fiscalYearId, fy.id)
        )
      )
      .orderBy(asc(journalEntry.number), asc(journalEntryLine.lineOrder));

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
      fiscalYear: {
        number: fy.number,
        startDate: fy.startDate,
        endDate: fy.endDate,
      },
      entries: result,
    };
  });

/* ═══════════════ REGLAS DE MAPEO (US 3.1.x) ═══════════════ */

type MappingRuleRow = typeof ledgerMappingRule.$inferSelect;

async function loadMappingRuleForOrg(
  ruleId: string,
  orgId: string
): Promise<MappingRuleRow> {
  const [row] = await db
    .select({ r: ledgerMappingRule })
    .from(ledgerMappingRule)
    .innerJoin(client, eq(client.id, ledgerMappingRule.clientId))
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(
      and(
        eq(ledgerMappingRule.id, ruleId),
        eq(representative.organizationId, orgId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Regla no encontrada o no autorizada');
  return row.r;
}

interface RuleLineInput {
  side: 'debit' | 'credit';
  amountBasis: string;
  fixedAmount?: number | null;
}
function validateRuleLines(lines: RuleLineInput[]): void {
  if (lines.length < 2)
    throw new Error('La regla debe tener al menos 2 líneas');
  const hasDebit = lines.some((l) => l.side === 'debit');
  const hasCredit = lines.some((l) => l.side === 'credit');
  if (!hasDebit || !hasCredit) {
    throw new Error(
      'La regla debe tener al menos una línea al Debe y una al Haber para que el asiento pueda cuadrar'
    );
  }
  for (const l of lines) {
    if (
      l.amountBasis === 'fixed' &&
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
  side: z.enum(['debit', 'credit']),
  amountBasis: z.enum([
    'total',
    'net',
    'vat',
    'other_taxes',
    'concept_value',
    'fixed',
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      sourceModule: z.enum(['invoice', 'payroll']).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const conds = [eq(ledgerMappingRule.clientId, ctx.data.clientId)];
    if (ctx.data.sourceModule)
      conds.push(eq(ledgerMappingRule.sourceModule, ctx.data.sourceModule));

    const rules = await db
      .select()
      .from(ledgerMappingRule)
      .where(and(...conds))
      .orderBy(asc(ledgerMappingRule.priority), asc(ledgerMappingRule.name));

    const ids = rules.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const cRows = await db
        .select({
          ruleId: ledgerMappingRuleLine.ruleId,
          n: sql<number>`count(*)::int`,
        })
        .from(ledgerMappingRuleLine)
        .where(inArray(ledgerMappingRuleLine.ruleId, ids))
        .groupBy(ledgerMappingRuleLine.ruleId);
      for (const c of cRows) counts.set(c.ruleId, c.n);
    }

    return rules.map(
      (r): MappingRuleListRow => ({
        id: r.id,
        name: r.name,
        sourceModule: r.sourceModule,
        ruleType: r.ruleType,
        condition: (r.condition ?? null) as RuleCondition,
        priority: r.priority,
        isActive: r.isActive,
        lineCount: counts.get(r.id) ?? 0,
      })
    );
  });

/** Detalle de una regla con sus líneas + cuántos asientos del período abierto generó. */
export const getMappingRule = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const rule = await loadMappingRuleForOrg(ctx.data.id, orgId);

    const lines = await db
      .select({
        id: ledgerMappingRuleLine.id,
        accountId: ledgerMappingRuleLine.accountId,
        accountCode: account.code,
        accountName: account.name,
        side: ledgerMappingRuleLine.side,
        amountBasis: ledgerMappingRuleLine.amountBasis,
        fixedAmount: ledgerMappingRuleLine.fixedAmount,
        description: ledgerMappingRuleLine.description,
        lineOrder: ledgerMappingRuleLine.lineOrder,
      })
      .from(ledgerMappingRuleLine)
      .innerJoin(account, eq(account.id, ledgerMappingRuleLine.accountId))
      .where(eq(ledgerMappingRuleLine.ruleId, rule.id))
      .orderBy(asc(ledgerMappingRuleLine.lineOrder));

    const [gen] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(journalEntry)
      .innerJoin(
        accountingPeriod,
        eq(accountingPeriod.id, journalEntry.periodId)
      )
      .where(
        and(
          eq(journalEntry.mappingRuleId, rule.id),
          eq(journalEntry.isVoided, false),
          eq(accountingPeriod.status, 'open')
        )
      );

    return {
      rule: { ...rule, condition: (rule.condition ?? null) as RuleCondition },
      lines: lines.map((l) => ({
        ...l,
        fixedAmount: l.fixedAmount ? parseFloat(l.fixedAmount) : null,
      })),
      generatedOpenCount: gen?.n ?? 0,
    };
  });

/** Crea una regla de mapeo con sus líneas-plantilla. (US 3.1.1) */
export const createMappingRule = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      name: z.string().min(1),
      sourceModule: z.enum(['invoice', 'payroll']),
      ruleType: z.enum(['default', 'conditional']).default('default'),
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
        .insert(ledgerMappingRule)
        .values({
          clientId: d.clientId,
          name: d.name.trim(),
          sourceModule: d.sourceModule,
          ruleType: d.ruleType,
          condition:
            d.ruleType === 'conditional' ? (d.condition ?? null) : null,
          priority: d.priority,
          isActive: true,
        })
        .returning();
      await tx.insert(ledgerMappingRuleLine).values(
        d.lines.map((l, i) => ({
          ruleId: r.id,
          accountId: l.accountId,
          side: l.side,
          amountBasis: l.amountBasis,
          fixedAmount:
            l.amountBasis === 'fixed' && l.fixedAmount != null
              ? String(l.fixedAmount)
              : null,
          description: l.description?.trim() ? l.description.trim() : null,
          lineOrder: i,
        }))
      );
      return r;
    });

    return { ...rule, condition: (rule.condition ?? null) as RuleCondition };
  });

/** Edita una regla. No regenera asientos ya creados. (US 3.1.3) */
export const updateMappingRule = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      sourceModule: z.enum(['invoice', 'payroll']),
      ruleType: z.enum(['default', 'conditional']).default('default'),
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
      rule.clientId,
      orgId,
      d.lines.map((l) => l.accountId)
    );

    await db.transaction(async (tx) => {
      await tx
        .update(ledgerMappingRule)
        .set({
          name: d.name.trim(),
          sourceModule: d.sourceModule,
          ruleType: d.ruleType,
          condition:
            d.ruleType === 'conditional' ? (d.condition ?? null) : null,
          priority: d.priority,
        })
        .where(eq(ledgerMappingRule.id, rule.id));
      await tx
        .delete(ledgerMappingRuleLine)
        .where(eq(ledgerMappingRuleLine.ruleId, rule.id));
      await tx.insert(ledgerMappingRuleLine).values(
        d.lines.map((l, i) => ({
          ruleId: rule.id,
          accountId: l.accountId,
          side: l.side,
          amountBasis: l.amountBasis,
          fixedAmount:
            l.amountBasis === 'fixed' && l.fixedAmount != null
              ? String(l.fixedAmount)
              : null,
          description: l.description?.trim() ? l.description.trim() : null,
          lineOrder: i,
        }))
      );
    });

    return { ok: true };
  });

/** Activa/desactiva una regla sin borrarla. (US 3.1.4) */
export const setMappingRuleActive = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const rule = await loadMappingRuleForOrg(ctx.data.id, orgId);
    await db
      .update(ledgerMappingRule)
      .set({ isActive: ctx.data.isActive })
      .where(eq(ledgerMappingRule.id, rule.id));
    return { ok: true };
  });

/**
 * Copia las reglas de una empresa a otra (isActive=false). Resuelve las cuentas
 * por código en la empresa destino; salta reglas con cuentas que no existen allí. (US 3.1.5)
 */
export const importMappingRules = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .from(ledgerMappingRule)
      .where(eq(ledgerMappingRule.clientId, fromClientId))
      .orderBy(asc(ledgerMappingRule.priority));
    if (srcRules.length === 0) return { created: 0, skipped: [] as string[] };

    const srcLines = await db
      .select({
        ruleId: ledgerMappingRuleLine.ruleId,
        code: account.code,
        side: ledgerMappingRuleLine.side,
        amountBasis: ledgerMappingRuleLine.amountBasis,
        fixedAmount: ledgerMappingRuleLine.fixedAmount,
        description: ledgerMappingRuleLine.description,
        lineOrder: ledgerMappingRuleLine.lineOrder,
      })
      .from(ledgerMappingRuleLine)
      .innerJoin(account, eq(account.id, ledgerMappingRuleLine.accountId))
      .where(
        inArray(
          ledgerMappingRuleLine.ruleId,
          srcRules.map((r) => r.id)
        )
      )
      .orderBy(asc(ledgerMappingRuleLine.lineOrder));

    // Mapa código→id de cuentas visibles para la empresa destino.
    const targetAccts = await db
      .select({ id: account.id, code: account.code })
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          sql`(${account.scope} = 'base' OR (${account.scope} = 'custom' AND ${account.clientId} = ${toClientId}))`
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
        skipped.push(r.name);
        continue;
      }
      await db.transaction(async (tx) => {
        const [nr] = await tx
          .insert(ledgerMappingRule)
          .values({
            clientId: toClientId,
            name: r.name,
            sourceModule: r.sourceModule,
            ruleType: r.ruleType,
            condition: r.condition,
            priority: r.priority,
            isActive: false,
          })
          .returning();
        await tx.insert(ledgerMappingRuleLine).values(
          resolved.map((l, i) => ({
            ruleId: nr.id,
            accountId: l.targetId!,
            side: l.side,
            amountBasis: l.amountBasis,
            fixedAmount: l.fixedAmount,
            description: l.description,
            lineOrder: i,
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
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.organizationId, orgId),
        eq(account.scope, 'base'),
        eq(account.code, PENDING_REVIEW_CODE)
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
async function loadActiveInvoiceRules(clientId: string): Promise<RuleLike[]> {
  const rules = await db
    .select()
    .from(ledgerMappingRule)
    .where(
      and(
        eq(ledgerMappingRule.clientId, clientId),
        eq(ledgerMappingRule.sourceModule, 'invoice'),
        eq(ledgerMappingRule.isActive, true)
      )
    )
    .orderBy(asc(ledgerMappingRule.priority), asc(ledgerMappingRule.name));
  if (rules.length === 0) return [];

  const lines = await db
    .select()
    .from(ledgerMappingRuleLine)
    .where(
      inArray(
        ledgerMappingRuleLine.ruleId,
        rules.map((r) => r.id)
      )
    )
    .orderBy(asc(ledgerMappingRuleLine.lineOrder));
  const byRule = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byRule.get(l.ruleId) ?? [];
    arr.push(l);
    byRule.set(l.ruleId, arr);
  }

  return rules.map(
    (r): RuleLike => ({
      id: r.id,
      name: r.name,
      ruleType: r.ruleType,
      condition: (r.condition ?? null) as Record<string, unknown> | null,
      priority: r.priority,
      lines: (byRule.get(r.id) ?? []).map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountBasis: l.amountBasis,
        fixedAmount: l.fixedAmount,
        description: l.description,
      })),
    })
  );
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const invoiceDateStr = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** Asiento auto vigente (no anulado) de una factura, si existe. */
async function findAutoEntryForInvoice(clientId: string, invoiceId: string) {
  const [row] = await db
    .select({
      id: journalEntry.id,
      number: journalEntry.number,
      periodId: journalEntry.periodId,
      isEditedPostGeneration: journalEntry.isEditedPostGeneration,
    })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.clientId, clientId),
        eq(journalEntry.sourceType, 'invoice'),
        eq(journalEntry.sourceId, invoiceId),
        eq(journalEntry.isVoided, false)
      )
    )
    .limit(1);
  return row ?? null;
}

interface InvoiceRow {
  id: string;
  emitionDate: Date;
  direction: string;
  type: string;
  recipientName: string;
  emitterName: string;
  amount: string;
  totalIVA: string;
  other_taxes: string;
}

/**
 * Inserta el asiento automático de una factura ya validada, dentro de una tx.
 * Calcula el número consecutivo del ejercicio. Devuelve el asiento creado.
 */
async function insertAutoInvoiceEntry(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    clientId: string;
    fyId: string;
    periodId: string;
    date: Date;
    inv: InvoiceRow;
    ruleId: string | null;
    lines: {
      accountId: string;
      debit: number;
      credit: number;
      description: string | null;
    }[];
    usedPendingReview: boolean;
    reason: string | null;
    userId: string | null;
  }
) {
  const {
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
      maxNum: sql<number>`coalesce(max(${journalEntry.number}),0)::int`,
    })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.clientId, clientId),
        eq(journalEntry.fiscalYearId, fyId)
      )
    );
  const number = (maxNum ?? 0) + 1;

  const dir = normalizeDirection(inv.direction);
  const who = dir === 'purchase' ? inv.emitterName : inv.recipientName;
  const label =
    dir === 'purchase' ? 'Compra' : dir === 'sale' ? 'Venta' : 'Comprobante';
  const description = `${label} ${inv.type} — ${who}`.trim();

  const [je] = await tx
    .insert(journalEntry)
    .values({
      clientId,
      fiscalYearId: fyId,
      periodId,
      number,
      entryDate: date,
      description,
      origin: 'auto_invoice',
      sourceType: 'invoice',
      sourceId: inv.id,
      mappingRuleId: ruleId,
      createdBy: userId,
    })
    .returning();

  await tx.insert(journalEntryLine).values(
    lines.map((l, i) => ({
      journalEntryId: je.id,
      accountId: l.accountId,
      clientId,
      periodId,
      debit: String(l.debit),
      credit: String(l.credit),
      description: l.description,
      lineOrder: i,
    }))
  );

  await tx.insert(accountingLog).values({
    clientId,
    fiscalYearId: fyId,
    eventType: 'journal_entry_created',
    eventData: {
      entryId: je.id,
      number,
      auto: true,
      source: 'invoice',
      invoiceId: inv.id,
      ruleId,
      pendingReview: usedPendingReview,
      reason,
    },
    userId,
  });

  return je;
}

type PlanResult =
  | {
      ok: false;
      reason: 'non_positive' | 'no_fy' | 'closed' | 'invalid_accounts';
      detail?: string;
    }
  | {
      ok: true;
      fyId: string;
      periodId: string;
      date: Date;
      ruleId: string | null;
      lines: {
        accountId: string;
        debit: number;
        credit: number;
        description: string | null;
      }[];
      usedPendingReview: boolean;
      reason: string | null;
    };

/** Decide (sin escribir) cómo se contabiliza una factura. Valida fecha, período y cuentas. */
async function planInvoiceEntry(
  inv: InvoiceRow,
  clientId: string,
  orgId: string,
  rules: RuleLike[],
  prId: string
): Promise<PlanResult> {
  const amounts = computeInvoiceAmounts(inv);
  if (amounts.total <= 0) return { ok: false, reason: 'non_positive' };

  let resolved;
  try {
    resolved = await resolvePeriodForDate(
      clientId,
      invoiceDateStr(inv.emitionDate)
    );
  } catch {
    return { ok: false, reason: 'no_fy' };
  }
  if (resolved.period.status === 'closed')
    return { ok: false, reason: 'closed' };

  const rule = selectRuleForInvoice(rules, inv);
  if (rule && rule.lines.length > 0) {
    try {
      await assertPostableAccounts(
        clientId,
        orgId,
        rule.lines.map((l) => l.accountId)
      );
    } catch (e) {
      return {
        ok: false,
        reason: 'invalid_accounts',
        detail: e instanceof Error ? e.message : undefined,
      };
    }
  }

  const built = buildEntryLines(rule, amounts, prId);
  return {
    ok: true,
    fyId: resolved.fy.id,
    periodId: resolved.period.id,
    date: resolved.date,
    ruleId: rule?.id ?? null,
    lines: built.lines,
    usedPendingReview: built.usedPendingReview,
    reason: built.reason,
  };
}

const INVOICE_SELECT = {
  id: invoice.id,
  emitionDate: invoice.emitionDate,
  direction: invoice.direction,
  type: invoice.type,
  recipientName: invoice.recipientName,
  emitterName: invoice.emitterName,
  amount: invoice.amount,
  totalIVA: invoice.totalIVA,
  other_taxes: invoice.other_taxes,
} as const;

/**
 * Previsualiza las facturas contabilizables de una empresa: para cada una indica
 * qué regla matchearía, si ya está contabilizada y el estado de su período. (US 3.2.1/3.2.2)
 */
export const getInvoicePostingPreview = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      direction: z.enum(['all', 'sale', 'purchase']).default('all'),
      includePosted: z.boolean().default(false),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const fys = await db
      .select()
      .from(fiscalYear)
      .where(eq(fiscalYear.clientId, clientId));
    if (fys.length === 0) return { hasFiscalYear: false, invoices: [] };

    const minStart = new Date(
      Math.min(...fys.map((f) => f.startDate.getTime()))
    );
    const maxEnd = new Date(Math.max(...fys.map((f) => f.endDate.getTime())));

    // Estado de períodos indexado por año-mes (único por empresa, ejercicios no se solapan).
    const periods = await db
      .select({
        year: accountingPeriod.year,
        month: accountingPeriod.month,
        status: accountingPeriod.status,
      })
      .from(accountingPeriod)
      .where(eq(accountingPeriod.clientId, clientId));
    const periodStatus = new Map(
      periods.map((p) => [`${p.year}-${p.month}`, p.status])
    );

    const invs = await db
      .select(INVOICE_SELECT)
      .from(invoice)
      .where(
        and(
          eq(invoice.clientId, clientId),
          gte(invoice.emitionDate, minStart),
          lte(invoice.emitionDate, maxEnd)
        )
      )
      .orderBy(asc(invoice.emitionDate))
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
          id: journalEntry.id,
          number: journalEntry.number,
          sourceId: journalEntry.sourceId,
          edited: journalEntry.isEditedPostGeneration,
        })
        .from(journalEntry)
        .where(
          and(
            eq(journalEntry.clientId, clientId),
            eq(journalEntry.sourceType, 'invoice'),
            eq(journalEntry.isVoided, false),
            inArray(journalEntry.sourceId, invIds)
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
      const amounts = computeInvoiceAmounts(inv);
      const dir = normalizeDirection(inv.direction);
      const rule = selectRuleForInvoice(rules, inv);
      const post = posted.get(inv.id) ?? null;
      const d = inv.emitionDate;
      const pStatus =
        periodStatus.get(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`) ??
        null;
      return {
        id: inv.id,
        emitionDate: inv.emitionDate.toISOString(),
        type: inv.type,
        direction: dir,
        counterparty: dir === 'purchase' ? inv.emitterName : inv.recipientName,
        total: amounts.total,
        net: amounts.net,
        vat: amounts.vat,
        otherTaxes: amounts.otherTaxes,
        ruleId: rule?.id ?? null,
        ruleName: rule?.name ?? null,
        willUsePendingReview: !rule || amounts.otherTaxes > 0.005,
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
  .inputValidator(
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
      .from(invoice)
      .where(
        and(
          eq(invoice.clientId, clientId),
          inArray(invoice.id, ctx.data.invoiceIds)
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
        else if (plan.reason === 'closed') summary.skippedClosed++;
        else
          summary.errors.push({
            invoiceId: id,
            reason: plan.detail ?? 'Cuentas inválidas en la regla',
          });
        continue;
      }
      await db.transaction(async (tx) => {
        await insertAutoInvoiceEntry(tx, {
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
  .inputValidator(
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
      .from(invoice)
      .where(and(eq(invoice.clientId, clientId), eq(invoice.id, invoiceId)))
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
      if (period.status === 'closed') {
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
          .update(journalEntry)
          .set({
            isVoided: true,
            voidedAt: sql`now()`,
            voidedBy: userId,
            voidReason: 'Regenerado desde el comprobante',
          })
          .where(eq(journalEntry.id, existing.id));
        await tx.insert(accountingLog).values({
          clientId,
          fiscalYearId: plan.fyId,
          eventType: 'journal_entry_voided',
          eventData: {
            entryId: existing.id,
            number: existing.number,
            auto: true,
            reason: 'Regenerado desde el comprobante',
          },
          userId,
        });
      }
      return insertAutoInvoiceEntry(tx, {
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
      number: je.number,
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
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const accounts = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.type, 'imputable'),
          sql`(${account.scope} = 'base' OR (${account.scope} = 'custom' AND ${account.clientId} = ${clientId}))`
        )
      )
      .orderBy(asc(account.code));

    const overrides = await db
      .select()
      .from(accountOverride)
      .where(eq(accountOverride.clientId, clientId));
    const ovMap = new Map(overrides.map((o) => [o.accountId, o]));

    const active = accounts.filter(
      (a) => ovMap.get(a.id)?.isActive ?? a.isActive
    );
    const opt = (a: (typeof active)[number]): AccountOpt => ({
      id: a.id,
      code: a.code,
      name: ovMap.get(a.id)?.customName ?? a.name,
    });

    return {
      assetAccounts: active
        .filter(
          (a) =>
            a.accountGroup === 'bienes_uso' && a.expectedBalance === 'debit'
        )
        .map(opt),
      accumAccounts: active
        .filter(
          (a) =>
            a.accountGroup === 'bienes_uso' && a.expectedBalance === 'credit'
        )
        .map(opt),
      expenseAccounts: active
        .filter(
          (a) =>
            a.accountGroup !== null &&
            (EXPENSE_ACCOUNT_GROUPS as readonly string[]).includes(
              a.accountGroup
            )
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
      id: account.id,
      code: account.code,
      group: account.accountGroup,
      expected: account.expectedBalance,
    })
    .from(account)
    .where(and(eq(account.organizationId, orgId), inArray(account.id, all)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const asset = byId.get(ids.assetAccountId);
  if (asset?.group !== 'bienes_uso' || asset.expected !== 'debit') {
    throw new Error(
      'La cuenta del activo debe ser un Bien de uso (saldo deudor), ej. "Rodados"'
    );
  }
  const accum = byId.get(ids.accumDeprAccountId);
  if (accum?.group !== 'bienes_uso' || accum.expected !== 'credit') {
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
  .inputValidator(fixedAssetInput)
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
      .insert(fixedAsset)
      .values({
        clientId: d.clientId,
        name: d.name,
        category: d.category,
        assetAccountId: d.assetAccountId,
        accumDeprAccountId: d.accumDeprAccountId,
        deprExpenseAccountId: d.deprExpenseAccountId,
        acquisitionDate: new Date(`${d.acquisitionDate}T00:00:00Z`),
        originalValue: String(d.originalValue),
        usefulLifeYears: d.usefulLifeYears,
        residualValue: String(d.residualValue),
        method: 'linear',
        status: 'active',
        createdBy: userId,
      })
      .returning();
    return row;
  });

export interface FixedAssetRow {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'sold' | 'discarded';
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      category: z.string().optional(),
      status: z.enum(['active', 'sold', 'discarded']).optional(),
    })
  )
  .handler(async (ctx): Promise<FixedAssetRow[]> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);

    const assetAcc = alias(account, 'asset_acc');
    const accumAcc = alias(account, 'accum_acc');
    const expAcc = alias(account, 'exp_acc');

    const conds = [eq(fixedAsset.clientId, clientId)];
    if (ctx.data.status) conds.push(eq(fixedAsset.status, ctx.data.status));
    if (ctx.data.category)
      conds.push(eq(fixedAsset.category, ctx.data.category as 'otros'));

    const rows = await db
      .select({
        fa: fixedAsset,
        assetName: assetAcc.name,
        assetCode: assetAcc.code,
        accumName: accumAcc.name,
        accumCode: accumAcc.code,
        expName: expAcc.name,
        expCode: expAcc.code,
      })
      .from(fixedAsset)
      .innerJoin(assetAcc, eq(assetAcc.id, fixedAsset.assetAccountId))
      .innerJoin(accumAcc, eq(accumAcc.id, fixedAsset.accumDeprAccountId))
      .innerJoin(expAcc, eq(expAcc.id, fixedAsset.deprExpenseAccountId))
      .where(and(...conds))
      .orderBy(asc(fixedAsset.category), asc(fixedAsset.name));

    const now = new Date();
    return rows.map((r): FixedAssetRow => {
      const snap = depreciationSnapshot(
        {
          acquisitionDate: r.fa.acquisitionDate,
          originalValue: r.fa.originalValue,
          usefulLifeYears: r.fa.usefulLifeYears,
          residualValue: r.fa.residualValue,
          status: r.fa.status,
          disposalDate: r.fa.disposalDate,
        },
        now
      );
      return {
        id: r.fa.id,
        name: r.fa.name,
        category: r.fa.category,
        status: r.fa.status,
        acquisitionDate: r.fa.acquisitionDate,
        originalValue: parseFloat(r.fa.originalValue),
        usefulLifeYears: r.fa.usefulLifeYears,
        residualValue: parseFloat(r.fa.residualValue),
        monthlyDepreciation: snap.monthly,
        accumulatedDepreciation: snap.accumulated,
        bookValue: snap.bookValue,
        assetAccount: `${r.assetCode} · ${r.assetName}`,
        accumDeprAccount: `${r.accumCode} · ${r.accumName}`,
        deprExpenseAccount: `${r.expCode} · ${r.expName}`,
        disposalDate: r.fa.disposalDate,
        disposalReason: r.fa.disposalReason,
      };
    });
  });

/** Da de baja un bien (venta / desuso / destrucción). (US 4.1.3) */
export const disposeFixedAsset = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      disposalDate: z.string(),
      reason: z.enum(['sale', 'disuse', 'destruction']),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Verificar pertenencia al estudio.
    const [row] = await db
      .select({ fa: fixedAsset })
      .from(fixedAsset)
      .innerJoin(client, eq(client.id, fixedAsset.clientId))
      .innerJoin(representative, eq(representative.id, client.representativeId))
      .where(
        and(
          eq(fixedAsset.id, ctx.data.id),
          eq(representative.organizationId, orgId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Bien no encontrado o no autorizado');
    if (row.fa.status !== 'active')
      throw new Error('El bien ya está dado de baja');

    const disposalDate = new Date(`${ctx.data.disposalDate}T00:00:00Z`);
    if (disposalDate < row.fa.acquisitionDate) {
      throw new Error(
        'La fecha de baja no puede ser anterior a la de adquisición'
      );
    }

    await db
      .update(fixedAsset)
      .set({
        status: ctx.data.reason === 'sale' ? 'sold' : 'discarded',
        disposalDate,
        disposalReason: ctx.data.reason,
      })
      .where(eq(fixedAsset.id, ctx.data.id));
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
  fechaInscripcion: Date | null;
  numeroInscripcion: string;
  accountant: AccountantSignatureData | null;
}

/** Datos de la empresa + firma del contador para el membrete de los EECC. */
export const getMembreteData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx): Promise<MembreteData> => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [c] = await db
      .select({
        name: client.name,
        identityNumber: client.identityNumber,
        address: client.address,
        actividadPrincipal: client.actividadPrincipal,
        fechaInscripcion: client.fechaInscripcion,
        numeroInscripcion: client.numeroInscripcion,
      })
      .from(client)
      .where(eq(client.id, ctx.data.clientId))
      .limit(1);

    const [sig] = await db
      .select()
      .from(accountantSignature)
      .where(eq(accountantSignature.organizationId, orgId))
      .limit(1);

    return {
      empresaName: c?.name ?? '',
      cuit: c?.identityNumber ?? '',
      domicilio: c?.address ?? '',
      actividadPrincipal: c?.actividadPrincipal ?? '',
      fechaInscripcion: c?.fechaInscripcion ?? null,
      numeroInscripcion: c?.numeroInscripcion ?? '',
      accountant: sig
        ? {
            nombre: sig.nombre ?? '',
            titulo: sig.titulo ?? 'Contador Público',
            universidad: sig.universidad ?? '',
            consejo: sig.consejo ?? '',
            tomo: sig.tomo ?? '',
            folio: sig.folio ?? '',
            firmaImagen: sig.firmaImagen ?? null,
          }
        : null,
    };
  });

/** Firma del contador del estudio (nivel organización). */
export const getAccountantSignature = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountantSignatureData | null> => {
    const { orgId } = await getSessionWithOrg();
    const [sig] = await db
      .select()
      .from(accountantSignature)
      .where(eq(accountantSignature.organizationId, orgId))
      .limit(1);
    if (!sig) return null;
    return {
      nombre: sig.nombre ?? '',
      titulo: sig.titulo ?? 'Contador Público',
      universidad: sig.universidad ?? '',
      consejo: sig.consejo ?? '',
      tomo: sig.tomo ?? '',
      folio: sig.folio ?? '',
      firmaImagen: sig.firmaImagen ?? null,
    };
  }
);

export const saveAccountantSignature = createServerFn({ method: 'POST' })
  .inputValidator(
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
    const values = {
      organizationId: orgId,
      nombre: ctx.data.nombre || null,
      titulo: ctx.data.titulo || 'Contador Público',
      universidad: ctx.data.universidad || null,
      consejo: ctx.data.consejo || null,
      tomo: ctx.data.tomo || null,
      folio: ctx.data.folio || null,
      firmaImagen: ctx.data.firmaImagen ?? null,
      updatedAt: new Date(),
    };
    await db
      .insert(accountantSignature)
      .values(values)
      .onConflictDoUpdate({
        target: accountantSignature.organizationId,
        set: {
          nombre: values.nombre,
          titulo: values.titulo,
          universidad: values.universidad,
          consejo: values.consejo,
          tomo: values.tomo,
          folio: values.folio,
          firmaImagen: values.firmaImagen,
          updatedAt: values.updatedAt,
        },
      });
    return { ok: true };
  });

/** Actualiza los datos fiscales de la empresa usados en el membrete de los EECC. */
export const updateClientFiscalData = createServerFn({ method: 'POST' })
  .inputValidator(
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

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (ctx.data.address !== undefined) set.address = ctx.data.address;
    if (ctx.data.actividadPrincipal !== undefined)
      set.actividadPrincipal = ctx.data.actividadPrincipal || null;
    if (ctx.data.numeroInscripcion !== undefined)
      set.numeroInscripcion = ctx.data.numeroInscripcion || null;
    if (ctx.data.fechaInscripcion !== undefined)
      set.fechaInscripcion = ctx.data.fechaInscripcion
        ? new Date(`${ctx.data.fechaInscripcion}T00:00:00Z`)
        : null;

    await db.update(client).set(set).where(eq(client.id, ctx.data.clientId));
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
  side: 'debit' | 'credit';
  amount: number;
}

const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
const endOfMonthBefore = (d: Date): Date => {
  // Último instante antes del inicio del ejercicio.
  return new Date(d.getTime() - 24 * 60 * 60 * 1000);
};

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
  const assetAcc = alias(account, 'anexo_asset');
  const accumAcc = alias(account, 'anexo_accum');
  const expAcc = alias(account, 'anexo_exp');

  const rows = await db
    .select({
      fa: fixedAsset,
      assetCode: assetAcc.code,
      assetName: assetAcc.name,
      accumCode: accumAcc.code,
      accumName: accumAcc.name,
      expCode: expAcc.code,
      expName: expAcc.name,
    })
    .from(fixedAsset)
    .innerJoin(assetAcc, eq(assetAcc.id, fixedAsset.assetAccountId))
    .innerJoin(accumAcc, eq(accumAcc.id, fixedAsset.accumDeprAccountId))
    .innerJoin(expAcc, eq(expAcc.id, fixedAsset.deprExpenseAccountId))
    .where(
      and(
        eq(fixedAsset.clientId, clientId),
        lte(fixedAsset.acquisitionDate, fy.endDate),
        or(
          isNull(fixedAsset.disposalDate),
          gte(fixedAsset.disposalDate, fy.startDate)
        )
      )
    )
    .orderBy(asc(fixedAsset.category), asc(fixedAsset.name));

  const startRef = endOfMonthBefore(fy.startDate);

  return rows.map((r): AnexoIAssetFull => {
    const a = {
      acquisitionDate: r.fa.acquisitionDate,
      originalValue: r.fa.originalValue,
      usefulLifeYears: r.fa.usefulLifeYears,
      residualValue: r.fa.residualValue,
      status: r.fa.status,
      disposalDate: r.fa.disposalDate,
    };
    const accumStart = accumulatedDepreciation(a, startRef);
    // Amortización acumulada devengada hasta el cierre (tope en la baja, si aplica).
    const accumEndRaw = accumulatedDepreciation(a, fy.endDate);
    const originalValue = parseFloat(r.fa.originalValue);
    const disposed = r.fa.status !== 'active';

    // Altas: bien incorporado dentro del ejercicio (el query ya garantiza
    // acquisitionDate <= fy.endDate).
    const acqDate =
      r.fa.acquisitionDate instanceof Date
        ? r.fa.acquisitionDate
        : new Date(r.fa.acquisitionDate);
    const isAlta = acqDate.getTime() >= fy.startDate.getTime();
    // Bajas: bien dado de baja dentro del ejercicio.
    const dispDate = r.fa.disposalDate
      ? r.fa.disposalDate instanceof Date
        ? r.fa.disposalDate
        : new Date(r.fa.disposalDate)
      : null;
    const isBaja =
      disposed &&
      dispDate != null &&
      dispDate.getTime() >= fy.startDate.getTime() &&
      dispDate.getTime() <= fy.endDate.getTime();

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
    const rate = r.fa.usefulLifeYears > 0 ? r2(100 / r.fa.usefulLifeYears) : 0;

    return {
      id: r.fa.id,
      name: r.fa.name,
      category: r.fa.category,
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
      assetAccountId: r.fa.assetAccountId,
      assetAccountLabel: `${r.assetCode} · ${r.assetName}`,
      accumAccountId: r.fa.accumDeprAccountId,
      accumAccountLabel: `${r.accumCode} · ${r.accumName}`,
      expenseAccountId: r.fa.deprExpenseAccountId,
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
  .inputValidator(
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
        side: 'debit' as const,
        amount: 0,
      };
      d.amount = r2(d.amount + row.amortYear);
      debitMap.set(row.expenseAccountId, d);

      const c = creditMap.get(row.accumAccountId) ?? {
        accountId: row.accumAccountId,
        code: row.accumAccountLabel.split(' · ')[0],
        name: row.accumAccountLabel.split(' · ').slice(1).join(' · '),
        side: 'credit' as const,
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
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number - 1)
        )
      )
      .limit(1);
    if (priorFy) {
      const priorRows = await computeAnexoIRows(clientId, priorFy);
      prior = {
        number: priorFy.number,
        grandTotals: groupAnexoI(priorRows).grandTotals,
      };
    }

    return {
      fiscalYear: {
        number: fy.number,
        startDate: fy.startDate,
        endDate: fy.endDate,
        status: fy.status,
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
  fiscalYearStatus: 'open' | 'closing' | 'closed';
  canClose: boolean;
  checks: YearEndCheck[];
}

/**
 * Valida las precondiciones para cerrar el ejercicio: 12 períodos cerrados, sin
 * asientos en pending_review, balance cuadrado, y reglas de mapeo consistentes. (US 5.1.1)
 */
export const getYearEndChecklist = createServerFn({ method: 'GET' })
  .inputValidator(
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
        month: accountingPeriod.month,
        status: accountingPeriod.status,
      })
      .from(accountingPeriod)
      .where(eq(accountingPeriod.fiscalYearId, fy.id))
      .orderBy(asc(accountingPeriod.month));
    const open = periods.filter((p) => p.status !== 'closed');
    checks.push({
      key: 'periods',
      label: 'Los 12 períodos del ejercicio están cerrados',
      status: open.length === 0 ? 'pass' : 'fail',
      detail:
        open.length === 0
          ? `${periods.length} de ${periods.length} períodos cerrados`
          : `Faltan cerrar: ${open.map((p) => MONTH_NAMES[p.month]).join(', ')}`,
    });

    // 2) Sin asientos en pendiente de revisión.
    const [{ pend }] = await db
      .select({ pend: sql<number>`count(distinct ${journalEntry.id})::int` })
      .from(journalEntry)
      .innerJoin(
        journalEntryLine,
        eq(journalEntryLine.journalEntryId, journalEntry.id)
      )
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          eq(account.organizationId, orgId),
          eq(account.code, PENDING_REVIEW_CODE)
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
        debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false)
        )
      );
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
        name: ledgerMappingRule.name,
        ruleType: ledgerMappingRule.ruleType,
        condition: ledgerMappingRule.condition,
      })
      .from(ledgerMappingRule)
      .where(
        and(
          eq(ledgerMappingRule.clientId, clientId),
          eq(ledgerMappingRule.isActive, true)
        )
      );
    const SUPPORTED_KEYS = ['direction', 'type', 'invoicetype'];
    const badRules = rules.filter((r) => {
      if (r.ruleType !== 'conditional') return false;
      const cond = r.condition as Record<string, unknown> | null;
      if (!cond || typeof cond !== 'object' || Object.keys(cond).length === 0)
        return true;
      const keys = Object.keys(cond).map((k) => k.toLowerCase());
      return !keys.some((k) => SUPPORTED_KEYS.includes(k));
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
      fiscalYearNumber: fy.number,
      fiscalYearStatus: fy.status,
      canClose:
        fy.status === 'open' && checks.every((c) => c.status === 'pass'),
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
      accountId: account.id,
      code: account.code,
      name: account.name,
      group: account.accountGroup,
      debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
    })
    .from(journalEntryLine)
    .innerJoin(
      journalEntry,
      eq(journalEntry.id, journalEntryLine.journalEntryId)
    )
    .innerJoin(account, eq(account.id, journalEntryLine.accountId))
    .where(
      and(
        eq(journalEntry.fiscalYearId, fyId),
        eq(journalEntry.isVoided, false),
        eq(account.organizationId, orgId)
      )
    )
    .groupBy(account.id, account.code, account.name, account.accountGroup);

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
    .select({ id: account.id, code: account.code, name: account.name })
    .from(account)
    .where(
      and(
        eq(account.organizationId, orgId),
        eq(account.scope, 'base'),
        eq(account.accountGroup, RESULT_TARGET_GROUP),
        eq(account.isSystemAccount, true)
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

const nextFyDates = (end: Date): { start: Date; end: Date } => {
  const start = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const sY = start.getUTCFullYear();
  const sM = start.getUTCMonth();
  const nextEnd = new Date(Date.UTC(sY, sM + 12, 0));
  return { start, end: nextEnd };
};

/** Líneas (cuenta + montos) de un asiento ya posteado, para el preview del wizard. */
async function loadEntryClosingLines(entryId: string): Promise<ClosingLine[]> {
  const ls = await db
    .select({
      accountId: journalEntryLine.accountId,
      code: account.code,
      name: account.name,
      debit: journalEntryLine.debit,
      credit: journalEntryLine.credit,
    })
    .from(journalEntryLine)
    .innerJoin(account, eq(account.id, journalEntryLine.accountId))
    .where(eq(journalEntryLine.journalEntryId, entryId))
    .orderBy(asc(journalEntryLine.lineOrder));
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
  fiscalYearStatus: 'open' | 'closing' | 'closed';
  resultado: {
    account: string;
    net: number;
    tipo: 'ganancia' | 'perdida' | 'neutro';
  };
  refundicion: ClosingStageView;
  cierre: ClosingStageView;
  apertura: ClosingStageView & {
    nextFy: { number: number; startDate: string; endDate: string } | null;
  };
  /** Ajuste por inflación: tiene que estar aplicado y al día antes de refundir. */
  inflation: {
    applied: boolean;
    stale: boolean;
    recpam: number | null;
    journalEntryNumber: number | null;
  };
}

/**
 * Estado del ajuste por inflación de un ejercicio, para el wizard de cierre.
 *
 * Ajustar tiene que pasar ANTES de la refundición: la refundición manda los
 * saldos de las cuentas de resultado a "Resultado del ejercicio", así que si se
 * cierra sin ajustar, el balance queda en valores históricos sin que nadie lo
 * advierta.
 *
 * `stale` significa que el asiento existe pero ya no coincide con el mayor
 * porque entraron o cambiaron asientos después de generarlo.
 */
async function loadInflationStatus(fyId: string): Promise<{
  applied: boolean;
  stale: boolean;
  recpam: number | null;
  journalEntryNumber: number | null;
}> {
  const [adj] = await db
    .select()
    .from(inflationAdjustment)
    .where(
      and(
        eq(inflationAdjustment.fiscalYearId, fyId),
        eq(inflationAdjustment.status, 'applied')
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
  if (adj.journalEntryId) {
    const [je] = await db
      .select({ number: journalEntry.number })
      .from(journalEntry)
      .where(eq(journalEntry.id, adj.journalEntryId))
      .limit(1);
    journalEntryNumber = je?.number ?? null;
  }

  // El asiento del ajuste debe ser el último movimiento no-cierre del ejercicio:
  // si después se cargó cualquier otro asiento, el ajuste quedó viejo.
  let stale = false;
  if (adj.appliedAt) {
    const [{ posteriores }] = await db
      .select({ posteriores: sql<number>`count(*)::int` })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.fiscalYearId, fyId),
          eq(journalEntry.isVoided, false),
          gt(journalEntry.createdAt, adj.appliedAt),
          sql`${journalEntry.origin} NOT IN ('auto_closing','auto_inflation')`
        )
      );
    stale = posteriores > 0;
  }

  return {
    applied: true,
    stale,
    recpam: Number(adj.recpamAmount),
    journalEntryNumber,
  };
}

/** Estado del wizard de cierre por etapa (con previews editables). (US 5.3.x) */
export const getClosingWizard = createServerFn({ method: 'GET' })
  .inputValidator(
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
        id: journalEntry.id,
        number: journalEntry.number,
        description: journalEntry.description,
      })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.clientId, clientId),
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.origin, 'auto_closing'),
          eq(journalEntry.isVoided, false)
        )
      )
      .orderBy(asc(journalEntry.number));
    const refEntry = closingEntries[0] ?? null;
    const cierreEntry = closingEntries[1] ?? null;

    // Asiento de apertura (en el próximo ejercicio).
    const [nextFy] = await db
      .select()
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number + 1)
        )
      )
      .limit(1);
    let aperturaEntry: { number: number } | null = null;
    if (nextFy) {
      const [op] = await db
        .select({ number: journalEntry.number })
        .from(journalEntry)
        .where(
          and(
            eq(journalEntry.fiscalYearId, nextFy.id),
            eq(journalEntry.origin, 'auto_opening'),
            eq(journalEntry.isVoided, false)
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

    const nd = nextFyDates(fy.endDate);

    return {
      fiscalYearNumber: fy.number,
      fiscalYearStatus: fy.status,
      resultado: {
        account: `${resultado.code} · ${resultado.name}`,
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
          number: fy.number + 1,
          startDate: nd.start.toISOString(),
          endDate: nd.end.toISOString(),
        },
      },
      inflation: await loadInflationStatus(fy.id),
    };
  });

const closingLineInput = z.object({
  accountId: z.string().uuid(),
  debit: z.number().min(0),
  credit: z.number().min(0),
});

/** Aprueba (persiste) el asiento de una etapa del cierre, con montos ya editados. (US 5.3.2) */
export const approveClosingStage = createServerFn({ method: 'POST' })
  .inputValidator(
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
    if (fy.status !== 'open') throw new Error('El ejercicio no está abierto');

    validateLineAmounts(ctx.data.lines);
    await assertPostableAccounts(
      clientId,
      orgId,
      ctx.data.lines.map((l) => l.accountId)
    );

    // Estado de etapas previas.
    const closingEntries = await db
      .select({ number: journalEntry.number })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.clientId, clientId),
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.origin, 'auto_closing'),
          eq(journalEntry.isVoided, false)
        )
      )
      .orderBy(asc(journalEntry.number));
    const refDone = closingEntries.length >= 1;
    const cierreDone = closingEntries.length >= 2;

    if (stage === 'refundicion' && refDone)
      throw new Error('La refundición ya fue registrada');

    // El ajuste por inflación va antes de la refundición: después, las cuentas de
    // resultado quedan refundidas y el balance saldría en valores históricos.
    if (stage === 'refundicion') {
      const inflation = await loadInflationStatus(fy.id);
      if (!inflation.applied) {
        throw new Error(
          'Falta generar el ajuste por inflación del ejercicio. Hacelo en la solapa «Ajuste por inflación» antes de refundir.'
        );
      }
      if (inflation.stale) {
        throw new Error(
          'El ajuste por inflación quedó desactualizado: se cargaron asientos después de generarlo. Regeneralo antes de refundir.'
        );
      }
    }
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
      .from(accountingPeriod)
      .where(
        and(
          eq(accountingPeriod.fiscalYearId, fy.id),
          eq(accountingPeriod.year, fy.endDate.getUTCFullYear()),
          eq(accountingPeriod.month, fy.endDate.getUTCMonth() + 1)
        )
      )
      .limit(1);
    if (!lastPeriod) throw new Error('No se encontró el período de cierre');

    const out = await db.transaction(async (tx) => {
      const insertEntry = async (
        fyId: string,
        periodId: string,
        date: Date,
        number: number,
        origin: 'auto_closing' | 'auto_opening',
        description: string
      ) => {
        const [je] = await tx
          .insert(journalEntry)
          .values({
            clientId,
            fiscalYearId: fyId,
            periodId,
            number,
            entryDate: date,
            description,
            origin,
            sourceType: 'closing',
            createdBy: userId,
          })
          .returning();
        await tx.insert(journalEntryLine).values(
          ctx.data.lines.map((l, i) => ({
            journalEntryId: je.id,
            accountId: l.accountId,
            clientId,
            periodId,
            debit: String(l.debit),
            credit: String(l.credit),
            description,
            lineOrder: i,
          }))
        );
        return je.number;
      };

      if (stage === 'apertura') {
        // Crea el próximo ejercicio (si no existe) + asiento de apertura.
        const nd = nextFyDates(fy.endDate);
        const sY = nd.start.getUTCFullYear();
        const sM = nd.start.getUTCMonth();
        const [nfy] = await tx
          .insert(fiscalYear)
          .values({
            clientId,
            startDate: nd.start,
            endDate: nd.end,
            status: 'open',
            number: fy.number + 1,
          })
          .returning();
        const periods = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(Date.UTC(sY, sM + i, 1));
          return {
            fiscalYearId: nfy.id,
            clientId,
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            status: 'open' as const,
          };
        });
        const inserted = await tx
          .insert(accountingPeriod)
          .values(periods)
          .returning();
        const first = inserted.find((p) => p.month === sM + 1)!;
        await insertEntry(
          nfy.id,
          first.id,
          nd.start,
          1,
          'auto_opening',
          `Asiento de apertura · Ejercicio N°${nfy.number}`
        );
        return { entryNumber: 1, nextFyNumber: nfy.number };
      }

      // Refundición / cierre: número consecutivo del ejercicio.
      const [{ maxNum }] = await tx
        .select({
          maxNum: sql<number>`coalesce(max(${journalEntry.number}),0)::int`,
        })
        .from(journalEntry)
        .where(
          and(
            eq(journalEntry.clientId, clientId),
            eq(journalEntry.fiscalYearId, fy.id)
          )
        );
      const number = (maxNum ?? 0) + 1;
      const description =
        stage === 'refundicion'
          ? 'Refundición de cuentas de resultado'
          : 'Asiento de cierre patrimonial';
      await insertEntry(
        fy.id,
        lastPeriod.id,
        fy.endDate,
        number,
        'auto_closing',
        description
      );
      return { entryNumber: number, nextFyNumber: null as number | null };
    });

    return { ok: true as const, stage, ...out };
  });

/** Sella el ejercicio: status='closed' + log. (US 5.3.3) */
export const sealClosing = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);
    if (fy.status !== 'open') throw new Error('El ejercicio ya está cerrado');

    const closingEntries = await db
      .select({ id: journalEntry.id })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.clientId, clientId),
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.origin, 'auto_closing'),
          eq(journalEntry.isVoided, false)
        )
      );
    if (closingEntries.length < 2) {
      throw new Error(
        'Faltan etapas: registrá la refundición y el cierre patrimonial antes de sellar'
      );
    }

    await db
      .update(fiscalYear)
      .set({ status: 'closed', closedAt: sql`now()`, closedBy: userId })
      .where(eq(fiscalYear.id, fy.id));
    await db.insert(accountingLog).values({
      clientId,
      fiscalYearId: fy.id,
      eventType: 'fiscal_year_closed',
      eventData: { number: fy.number },
      userId,
    });
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
 * Saldos por cuenta de un ejercicio.
 *
 * Se excluye el asiento de cierre (`auto_closing`): si no, un ejercicio cerrado
 * daría todo en cero y el resultado se computa igual desde las cuentas de
 * resultado. El asiento de apertura (`auto_opening`) **sí** entra: lo genera el
 * cierre del ejercicio anterior con el id del ejercicio nuevo, y es el que trae
 * el patrimonio inicial. Sin él, todo ejercicio a partir del segundo mostraría
 * un ESP sin saldos de arranque.
 *
 * `view='ajustado'` (default) incluye el asiento de ajuste por inflación, que es
 * como se presentan los EECC. `view='historico'` lo excluye y devuelve los
 * valores históricos, que quedan como papel de trabajo.
 */
async function computeEspBalances(
  orgId: string,
  fyId: string,
  view: 'ajustado' | 'historico' = 'ajustado'
): Promise<EspBalance[]> {
  const excluded =
    view === 'historico'
      ? sql`${journalEntry.origin} NOT IN ('auto_closing','auto_inflation')`
      : sql`${journalEntry.origin} <> 'auto_closing'`;
  const rows = await db
    .select({
      accountId: account.id,
      code: account.code,
      name: account.name,
      group: account.accountGroup,
      debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
    })
    .from(journalEntryLine)
    .innerJoin(
      journalEntry,
      eq(journalEntry.id, journalEntryLine.journalEntryId)
    )
    .innerJoin(account, eq(account.id, journalEntryLine.accountId))
    .where(
      and(
        eq(journalEntry.fiscalYearId, fyId),
        eq(journalEntry.isVoided, false),
        eq(account.organizationId, orgId),
        excluded
      )
    )
    .groupBy(account.id, account.code, account.name, account.accountGroup);
  return rows.map((r) => ({
    accountId: r.accountId,
    code: r.code,
    name: r.name,
    group: r.group,
    saldo: r2(parseFloat(r.debit) - parseFloat(r.credit)),
  }));
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
  /** Coeficiente con el que se reexpresó la columna anterior. null = quedó histórica. */
  priorCoefficient: number | null;
}

/** Contrapartida del ajuste por inflación; se expone en su propia línea del ER. */
const RECPAM_ACCOUNT_CODE = '5.4.004';

const ESP_SECTIONS = ACCOUNT_GROUP_SECTIONS.filter(
  (s) => s.section !== 'Resultados'
);

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
 */
async function priorColumnCoefficient(
  currentEnd: Date,
  priorEnd: Date
): Promise<number | null> {
  const load = async (d: Date) => {
    const [row] = await db
      .select({ value: inflationIndex.value })
      .from(inflationIndex)
      .where(
        and(
          eq(inflationIndex.source, 'facpce_rt6'),
          eq(inflationIndex.year, d.getUTCFullYear()),
          eq(inflationIndex.month, d.getUTCMonth() + 1)
        )
      )
      .limit(1);
    return row ? Number(row.value) : null;
  };
  const [cur, pri] = await Promise.all([load(currentEnd), load(priorEnd)]);
  if (!cur || !pri || pri <= 0) return null;
  return Math.round((cur / pri) * 10000) / 10000;
}

/** Estado de Situación Patrimonial comparativo (actual vs anterior). (US 6.1.1/6.1.2) */
export const getESP = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      view: z.enum(['ajustado', 'historico']).default('ajustado'),
    })
  )
  .handler(async (ctx): Promise<EspResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [priorFy] = await db
      .select()
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number - 1)
        )
      )
      .limit(1);

    const curBal = await computeEspBalances(orgId, fy.id, ctx.data.view);
    let priBal = priorFy
      ? await computeEspBalances(orgId, priorFy.id, ctx.data.view)
      : [];

    // El comparativo se reexpresa a la moneda de cierre actual (ver
    // priorColumnCoefficient). En la vista histórica se deja como está.
    let priorCoefficient: number | null = null;
    if (priorFy && ctx.data.view === 'ajustado') {
      priorCoefficient = await priorColumnCoefficient(
        fy.endDate,
        priorFy.endDate
      );
      if (priorCoefficient !== null) {
        const k = priorCoefficient;
        priBal = priBal.map((b) => ({ ...b, saldo: r2(b.saldo * k) }));
      }
    }
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

    const fmtD = (d: Date) =>
      `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;

    return {
      fiscalYearNumber: fy.number,
      priorFiscalYearNumber: priorFy?.number ?? null,
      periodLabel: `${fmtD(fy.startDate)} – ${fmtD(fy.endDate)}`,
      sections,
      totals,
      balancedCurrent:
        Math.abs(totals.activo.current - totals.pasivoMasPn.current) < 0.005,
      balancedPrior: priorFy
        ? Math.abs(totals.activo.prior - totals.pasivoMasPn.prior) < 0.005
        : true,
      hasPrior: !!priorFy,
      priorCoefficient,
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
  /** Coeficiente con el que se reexpresó la columna anterior. null = quedó histórica. */
  priorCoefficient: number | null;
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      view: z.enum(['ajustado', 'historico']).default('ajustado'),
    })
  )
  .handler(async (ctx): Promise<ErResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [priorFy] = await db
      .select()
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number - 1)
        )
      )
      .limit(1);

    const curBal = await computeEspBalances(orgId, fy.id, ctx.data.view);
    let priBal = priorFy
      ? await computeEspBalances(orgId, priorFy.id, ctx.data.view)
      : [];

    // El comparativo se reexpresa a la moneda de cierre actual (ver
    // priorColumnCoefficient). En la vista histórica se deja como está.
    let priorCoefficient: number | null = null;
    if (priorFy && ctx.data.view === 'ajustado') {
      priorCoefficient = await priorColumnCoefficient(
        fy.endDate,
        priorFy.endDate
      );
      if (priorCoefficient !== null) {
        const k = priorCoefficient;
        priBal = priBal.map((b) => ({ ...b, saldo: r2(b.saldo * k) }));
      }
    }
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

    // El RECPAM vive en el rubro "Gastos financieros" del plan de cuentas, pero
    // en el estado se expone como línea propia: es el resultado del ajuste por
    // inflación, no un gasto de financiación. Así lo presenta el estudio.
    const finComp = comp.get('gastos_financieros')!;
    const recpamAccounts = finComp.accounts.filter(
      (a) => a.code === RECPAM_ACCOUNT_CODE
    );
    if (recpamAccounts.length > 0) {
      const rest = finComp.accounts.filter(
        (a) => a.code !== RECPAM_ACCOUNT_CODE
      );
      comp.set('gastos_financieros', {
        ...finComp,
        accounts: rest,
        current: r2(rest.reduce((t, a) => t + a.current, 0)),
        prior: r2(rest.reduce((t, a) => t + a.prior, 0)),
      });
      comp.set('recpam', {
        key: 'recpam',
        label: 'RECPAM',
        groups: [],
        accounts: recpamAccounts,
        current: r2(recpamAccounts.reduce((t, a) => t + a.current, 0)),
        prior: r2(recpamAccounts.reduce((t, a) => t + a.prior, 0)),
      });
    }
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
    const recpam = comp.get('recpam');
    const otros = comp.get('otros_resultados')!;
    const resOperativo = {
      current: r2(
        resBruto.current +
          admin.current +
          comerc.current +
          fin.current +
          (recpam?.current ?? 0) +
          otros.current
      ),
      prior: r2(
        resBruto.prior +
          admin.prior +
          comerc.prior +
          fin.prior +
          (recpam?.prior ?? 0) +
          otros.prior
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
      ...(comp.has('recpam') ? [compLine('recpam')] : []),
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

    const fmtD = (d: Date) =>
      `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;

    return {
      fiscalYearNumber: fy.number,
      priorFiscalYearNumber: priorFy?.number ?? null,
      periodLabel: `${fmtD(fy.startDate)} – ${fmtD(fy.endDate)}`,
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
      priorCoefficient,
    };
  });

/* ── Anexo II — Gastos por función (US 6.3.2) ── */

type ExpenseFunction = 'administration' | 'sales' | 'financial' | 'other';

/** Mapeo de rubro de gasto → función, cuando la cuenta no tiene expenseFunction explícito. */
const EXPENSE_GROUP_TO_FUNCTION: Record<string, ExpenseFunction> = {
  gastos_administracion: 'administration',
  gastos_comercializacion: 'sales',
  gastos_financieros: 'financial',
  costo_ventas: 'other',
  otros_resultados_neg: 'other',
  impuesto_ganancias: 'other',
};

const EXPENSE_FUNCTION_ORDER: ExpenseFunction[] = [
  'administration',
  'sales',
  'financial',
  'other',
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
      accountId: account.id,
      code: account.code,
      name: account.name,
      group: account.accountGroup,
      expenseFunction: account.expenseFunction,
      debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
    })
    .from(journalEntryLine)
    .innerJoin(
      journalEntry,
      eq(journalEntry.id, journalEntryLine.journalEntryId)
    )
    .innerJoin(account, eq(account.id, journalEntryLine.accountId))
    .where(
      and(
        eq(journalEntry.fiscalYearId, fyId),
        eq(journalEntry.isVoided, false),
        eq(account.organizationId, orgId),
        inArray(
          account.accountGroup,
          EXPENSE_ACCOUNT_GROUPS as unknown as AccountGroup[]
        ),
        sql`${journalEntry.origin} NOT IN ('auto_closing','auto_opening')`
      )
    )
    .groupBy(
      account.id,
      account.code,
      account.name,
      account.accountGroup,
      account.expenseFunction
    );
  return rows.map((r) => ({
    accountId: r.accountId,
    code: r.code,
    name: r.name,
    fn:
      r.expenseFunction ?? EXPENSE_GROUP_TO_FUNCTION[r.group ?? ''] ?? 'other',
    saldo: r2(parseFloat(r.debit) - parseFloat(r.credit)),
  }));
}

/** Anexo II — clasifica los gastos del ER por función, con comparativo. (US 6.3.2) */
export const getAnexoII = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(async (ctx): Promise<AnexoIIResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientId } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    const fy = await loadFiscalYearForOrg(ctx.data.fiscalYearId, orgId);

    const [priorFy] = await db
      .select()
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number - 1)
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

    const fmtD = (d: Date) =>
      `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;

    return {
      fiscalYearNumber: fy.number,
      priorFiscalYearNumber: priorFy?.number ?? null,
      periodLabel: `${fmtD(fy.startDate)} – ${fmtD(fy.endDate)}`,
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

const fmtDateDMY = (d: Date) =>
  `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}/${d.getUTCFullYear()}`;

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
  .inputValidator(
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
      .from(cmvAnnex)
      .where(eq(cmvAnnex.fiscalYearId, fy.id))
      .limit(1);

    const ini = row ? parseFloat(row.existenciaInicial) : 0;
    const compras = row ? parseFloat(row.comprasGastos) : 0;
    const fin = row ? parseFloat(row.existenciaFinal) : 0;

    // Comparativo con el ejercicio anterior (número − 1), si tiene CMV cargado.
    let priorFiscalYearNumber: number | null = null;
    let priorTotal: number | null = null;
    const [priorFy] = await db
      .select()
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number - 1)
        )
      )
      .limit(1);
    if (priorFy) {
      priorFiscalYearNumber = priorFy.number;
      const [pr] = await db
        .select()
        .from(cmvAnnex)
        .where(eq(cmvAnnex.fiscalYearId, priorFy.id))
        .limit(1);
      if (pr)
        priorTotal = cmvTotal(
          pr.existenciaInicial,
          pr.comprasGastos,
          pr.existenciaFinal
        );
    }

    return {
      fiscalYearNumber: fy.number,
      periodLabel: `${fmtDateDMY(fy.startDate)} – ${fmtDateDMY(fy.endDate)}`,
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
  .inputValidator(
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
      updatedAt: new Date(),
    };
    await db
      .insert(cmvAnnex)
      .values({
        organizationId: orgId,
        clientId,
        fiscalYearId: fy.id,
        ...vals,
      })
      .onConflictDoUpdate({
        target: cmvAnnex.fiscalYearId,
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
  status: 'draft' | 'approved';
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

/** Devuelve el financialStatement del ejercicio (o un borrador vacío si no existe). */
export const getFinancialStatement = createServerFn({ method: 'GET' })
  .inputValidator(
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
        id: financialStatement.id,
        status: financialStatement.status,
        notes: financialStatement.notes,
        approvedAt: financialStatement.approvedAt,
        approvedByName: user.name,
        pdfGeneratedAt: financialStatement.pdfGeneratedAt,
        pdfSizeBytes: financialStatement.pdfSizeBytes,
        pdfGeneratedByName: pdfUser.name,
      })
      .from(financialStatement)
      .leftJoin(user, eq(user.id, financialStatement.approvedBy))
      .leftJoin(pdfUser, eq(pdfUser.id, financialStatement.pdfGeneratedBy))
      .where(
        and(
          eq(financialStatement.fiscalYearId, fiscalYearId),
          eq(financialStatement.clientId, clientId)
        )
      )
      .limit(1);

    if (!row) {
      return {
        id: null,
        status: 'draft',
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
  .inputValidator(
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
      .select({ id: financialStatement.id, status: financialStatement.status })
      .from(financialStatement)
      .where(
        and(
          eq(financialStatement.fiscalYearId, fiscalYearId),
          eq(financialStatement.clientId, clientId)
        )
      )
      .limit(1);

    if (existing?.status === 'approved') {
      throw new Error(
        'Los EECC están aprobados. Reabrilos a borrador para editar las notas.'
      );
    }

    if (existing) {
      await db
        .update(financialStatement)
        .set({ notes })
        .where(eq(financialStatement.id, existing.id));
    } else {
      await db.insert(financialStatement).values({
        organizationId: orgId,
        clientId,
        fiscalYearId,
        notes,
      });
    }
    return { ok: true };
  });

/** Aprueba el paquete EECC: status draft→approved, queda inmutable y se registra en el log. (US 6.3.3) */
export const approveFinancialStatement = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .select({ id: financialStatement.id, status: financialStatement.status })
      .from(financialStatement)
      .where(
        and(
          eq(financialStatement.fiscalYearId, fiscalYearId),
          eq(financialStatement.clientId, clientId)
        )
      )
      .limit(1);

    if (existing?.status === 'approved') {
      throw new Error('Los EECC ya están aprobados.');
    }

    const now = new Date();
    if (existing) {
      await db
        .update(financialStatement)
        .set({ status: 'approved', approvedAt: now, approvedBy: userId })
        .where(eq(financialStatement.id, existing.id));
    } else {
      await db.insert(financialStatement).values({
        organizationId: orgId,
        clientId,
        fiscalYearId,
        status: 'approved',
        approvedAt: now,
        approvedBy: userId,
      });
    }

    await db.insert(accountingLog).values({
      clientId,
      fiscalYearId,
      eventType: 'financial_statement_approved',
      eventData: { fiscalYearNumber: fy.number },
      userId,
    });

    return { ok: true };
  });

/** Reabre un paquete aprobado a borrador para poder regenerarlo/editarlo. (US 6.3.3) */
export const reopenFinancialStatement = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .update(financialStatement)
      .set({ status: 'draft', approvedAt: null, approvedBy: null })
      .where(
        and(
          eq(financialStatement.fiscalYearId, fiscalYearId),
          eq(financialStatement.clientId, clientId)
        )
      );
    return { ok: true };
  });

/* ── Persistencia del PDF del paquete EECC (US 7.1.1) ── */

/** Guarda el PDF generado del paquete asociado al financialStatement del ejercicio. */
export const saveFinancialStatementPdf = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .select({ id: financialStatement.id })
      .from(financialStatement)
      .where(
        and(
          eq(financialStatement.fiscalYearId, fiscalYearId),
          eq(financialStatement.clientId, clientId)
        )
      )
      .limit(1);

    const now = new Date();
    if (existing) {
      await db
        .update(financialStatement)
        .set({
          pdfUrl: dataUrl,
          pdfSizeBytes: sizeBytes,
          pdfGeneratedAt: now,
          pdfGeneratedBy: userId,
        })
        .where(eq(financialStatement.id, existing.id));
    } else {
      await db.insert(financialStatement).values({
        organizationId: orgId,
        clientId,
        fiscalYearId,
        pdfUrl: dataUrl,
        pdfSizeBytes: sizeBytes,
        pdfGeneratedAt: now,
        pdfGeneratedBy: userId,
      });
    }
    return { ok: true };
  });

/** Devuelve el PDF guardado del paquete (data URL) para re-descargar, o null. */
export const getFinancialStatementPdf = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid() })
  )
  .handler(
    async (
      ctx
    ): Promise<{ dataUrl: string; generatedAt: string | null } | null> => {
      const { orgId } = await getSessionWithOrg();
      const { clientId, fiscalYearId } = ctx.data;
      await ensureClientBelongsToOrg(clientId, orgId);
      await loadFiscalYearForOrg(fiscalYearId, orgId);

      const [row] = await db
        .select({
          pdfUrl: financialStatement.pdfUrl,
          pdfGeneratedAt: financialStatement.pdfGeneratedAt,
        })
        .from(financialStatement)
        .where(
          and(
            eq(financialStatement.fiscalYearId, fiscalYearId),
            eq(financialStatement.clientId, clientId)
          )
        )
        .limit(1);

      if (!row?.pdfUrl) return null;
      return {
        dataUrl: row.pdfUrl,
        generatedAt: row.pdfGeneratedAt
          ? row.pdfGeneratedAt.toISOString()
          : null,
      };
    }
  );

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
  accountId: string;
  code: string;
  name: string;
  group: string;
  groupLabel: string;
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
  /** Total del PN al cierre del ejercicio anterior, reexpresado a moneda de cierre. */
  priorTotal: number | null;
  priorCoefficient: number | null;
  /** Total del PN según el ESP; debe coincidir con el saldo al cierre. */
  espTotal: number;
  matchesEsp: boolean;
  /** El ajuste por inflación del ejercicio está aplicado. */
  inflationApplied: boolean;
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
 *    a él sino a Ajuste de capital (`account.inflationTargetId`). Por eso la
 *    columna "Ajuste de capital" arranca con el ajuste anterior reexpresado más
 *    el del capital — las "dos fórmulas" que describió el contador.
 *
 * Las variaciones del ejercicio se exponen desglosadas por asiento, con su
 * descripción: el sistema no infiere si un movimiento es un dividendo o una
 * constitución de reserva, lo muestra tal como lo cargó el contador.
 */
export const getEEPN = createServerFn({ method: 'GET' })
  .inputValidator(
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

    const [priorFy] = await db
      .select()
      .from(fiscalYear)
      .where(
        and(
          eq(fiscalYear.clientId, clientId),
          eq(fiscalYear.number, fy.number - 1)
        )
      )
      .limit(1);

    // Cuentas de PN visibles para la empresa.
    const pnAccounts = await db
      .select({
        id: account.id,
        code: account.code,
        name: account.name,
        group: account.accountGroup,
        inflationTargetId: account.inflationTargetId,
      })
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.type, 'imputable'),
          inArray(account.accountGroup, PN_GROUPS as unknown as AccountGroup[]),
          sql`(${account.scope} = 'base' OR ${account.clientId} = ${clientId})`
        )
      )
      .orderBy(asc(account.code));
    const pnIds = new Set(pnAccounts.map((a) => a.id));

    /** Signo de exposición: el PN es acreedor, así que se invierte. */
    const expose = (saldo: number) => r2(-saldo);

    // 1. Saldos de apertura (histórico), del asiento de apertura del ejercicio.
    const openingRows = await db
      .select({
        accountId: journalEntryLine.accountId,
        debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          eq(journalEntry.origin, 'auto_opening')
        )
      )
      .groupBy(journalEntryLine.accountId);

    const inicio: Record<string, number> = {};
    for (const r of openingRows) {
      if (!pnIds.has(r.accountId)) continue;
      inicio[r.accountId] = expose(parseFloat(r.debit) - parseFloat(r.credit));
    }

    // 2. Reexpresión del patrimonio inicial → se incorpora a la fila de inicio,
    //    imputada a la cuenta destino (Capital social → Ajuste de capital).
    const [adjustment] = await db
      .select()
      .from(inflationAdjustment)
      .where(
        and(
          eq(inflationAdjustment.fiscalYearId, fy.id),
          eq(inflationAdjustment.status, 'applied')
        )
      )
      .limit(1);

    const reexpresionMovimientos: Record<string, number> = {};
    if (adjustment && view === 'ajustado') {
      const adjLines = await db
        .select({
          accountId: inflationAdjustmentLine.accountId,
          isOpening: inflationAdjustmentLine.isOpening,
          difference: inflationAdjustmentLine.difference,
        })
        .from(inflationAdjustmentLine)
        .where(eq(inflationAdjustmentLine.adjustmentId, adjustment.id));

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
        entryId: journalEntry.id,
        number: journalEntry.number,
        entryDate: journalEntry.entryDate,
        description: journalEntry.description,
        accountId: journalEntryLine.accountId,
        debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          sql`${journalEntry.origin} NOT IN ('auto_opening','auto_closing','auto_inflation')`,
          inArray(journalEntryLine.accountId, [...pnIds])
        )
      )
      .groupBy(
        journalEntry.id,
        journalEntry.number,
        journalEntry.entryDate,
        journalEntry.description,
        journalEntryLine.accountId
      )
      .orderBy(asc(journalEntry.number));

    const movimientos = new Map<
      string,
      {
        number: number;
        entryDate: Date;
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
    const columns: EepnColumn[] = pnAccounts
      .filter((a) => touched.has(a.id))
      .map((a) => ({
        accountId: a.id,
        code: a.code,
        name: a.name,
        group: a.group ?? '',
        groupLabel: ACCOUNT_GROUP_LABELS[a.group!] ?? a.group ?? '',
      }));

    const sumRow = (amounts: Record<string, number>) =>
      r2(columns.reduce((s, c) => s + (amounts[c.accountId] ?? 0), 0));

    const rows: EepnRow[] = [];
    rows.push({
      key: 'inicio',
      label: 'Saldos al inicio del ejercicio',
      kind: 'inicio',
      amounts: inicio,
      total: sumRow(inicio),
    });

    for (const [entryId, m] of movimientos) {
      rows.push({
        key: `mov-${entryId}`,
        label: m.description ?? `Asiento N° ${m.number}`,
        kind: 'movimiento',
        amounts: m.amounts,
        total: sumRow(m.amounts),
        entryNumber: m.number,
        entryDate: m.entryDate.toISOString(),
      });
    }

    if (Object.keys(reexpresionMovimientos).length > 0) {
      rows.push({
        key: 'reexpresion-movimientos',
        label: 'Reexpresión de los movimientos del ejercicio',
        kind: 'movimiento',
        amounts: reexpresionMovimientos,
        total: sumRow(reexpresionMovimientos),
      });
    }

    rows.push({
      key: 'resultado',
      label: 'Resultado del ejercicio',
      kind: 'resultado',
      amounts: resultadoAmounts,
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
      amounts: cierre,
      total: sumRow(cierre),
    });

    // 7. Comparativo: PN al cierre del ejercicio anterior, en moneda de cierre.
    let priorTotal: number | null = null;
    let priorCoefficient: number | null = null;
    if (priorFy) {
      const priorBalances = await computeEspBalances(orgId, priorFy.id, view);
      const priorPn = r2(
        priorBalances
          .filter(
            (b) =>
              b.group &&
              (
                [...PN_GROUPS, ...RESULT_ACCOUNT_GROUPS] as readonly string[]
              ).includes(b.group)
          )
          .reduce((s, b) => s + expose(b.saldo), 0)
      );
      if (view === 'ajustado') {
        priorCoefficient = await priorColumnCoefficient(
          fy.endDate,
          priorFy.endDate
        );
      }
      priorTotal = priorCoefficient ? r2(priorPn * priorCoefficient) : priorPn;
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

    const fmtD = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

    const cierreTotal = rows[rows.length - 1].total;
    return {
      fiscalYearNumber: fy.number,
      priorFiscalYearNumber: priorFy?.number ?? null,
      periodLabel: `${fmtD(fy.startDate)} – ${fmtD(fy.endDate)}`,
      columns,
      rows,
      priorTotal,
      priorCoefficient,
      espTotal,
      matchesEsp: Math.abs(cierreTotal - espTotal) < 0.05,
      inflationApplied: !!adjustment,
    };
  });

/* ── Estado de Flujo de Efectivo (EFE) — método directo — AXI-7 ── */

export interface EfeLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface EfeActivity {
  key: CashFlowActivity;
  label: string;
  lines: EfeLine[];
  total: number;
}

export interface EfeResult {
  fiscalYearNumber: number;
  periodLabel: string;
  /** Efectivo al inicio, ya reexpresado a moneda de cierre si la vista es ajustada. */
  efectivoInicio: number;
  efectivoInicioHistorico: number;
  /** Coeficiente con el que se reexpresó el efectivo inicial. null = no se reexpresó. */
  coeficienteInicio: number | null;
  efectivoCierre: number;
  variacion: number;
  activities: EfeActivity[];
  /**
   * Resultado por exposición a la inflación del efectivo: cierra el estado. Es
   * la pérdida (o ganancia) de poder adquisitivo por haber mantenido efectivo.
   */
  recpamEfectivo: number;
  totalCausas: number;
  cuadra: boolean;
  /** Cuentas que movieron efectivo pero no tienen actividad asignada. */
  sinActividad: { code: string; name: string }[];
  inflationApplied: boolean;
}

/**
 * Estado de Flujo de Efectivo por método directo.
 *
 * Toma todos los asientos que tocan una cuenta de efectivo y usa **la
 * contrapartida** para clasificar el movimiento por actividad: si pagué un
 * sueldo, la causa es operativa; si compré una máquina, de inversión. Como todo
 * asiento cuadra, la suma de las contrapartidas con signo invertido es
 * exactamente el movimiento de efectivo — no hay que prorratear nada.
 *
 * En la vista ajustada cada flujo se reexpresa por el coeficiente de su mes y el
 * efectivo inicial por el del cierre anterior. La diferencia entre la variación
 * real del efectivo y la suma de los flujos reexpresados es el **RECPAM del
 * efectivo**: la pérdida de poder adquisitivo por haber tenido plata quieta. Se
 * expone como una línea propia, que es lo que hace cerrar el estado.
 */
export const getEFE = createServerFn({ method: 'GET' })
  .inputValidator(
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

    const accounts = await db
      .select({
        id: account.id,
        code: account.code,
        name: account.name,
        group: account.accountGroup,
        activity: account.cashFlowActivity,
      })
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.type, 'imputable'),
          sql`(${account.scope} = 'base' OR ${account.clientId} = ${clientId})`
        )
      );
    const accById = new Map(accounts.map((a) => [a.id, a]));
    const cashIds = new Set(
      accounts.filter((a) => isCashGroup(a.group)).map((a) => a.id)
    );

    // Efectivo al inicio: del asiento de apertura.
    const openingRows = await db
      .select({
        accountId: journalEntryLine.accountId,
        debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          eq(journalEntry.origin, 'auto_opening')
        )
      )
      .groupBy(journalEntryLine.accountId);

    const efectivoInicioHistorico = r2(
      openingRows
        .filter((r) => cashIds.has(r.accountId))
        .reduce((s, r) => s + parseFloat(r.debit) - parseFloat(r.credit), 0)
    );

    // Efectivo al cierre: saldo del mayor (el efectivo es monetario, así que no
    // cambia entre la vista histórica y la ajustada).
    const balances = await computeEspBalances(orgId, fy.id, view);
    const efectivoCierre = r2(
      balances
        .filter((b) => cashIds.has(b.accountId))
        .reduce((s, b) => s + b.saldo, 0)
    );

    // Movimientos del ejercicio, por asiento y mes.
    const lines = await db
      .select({
        entryId: journalEntry.id,
        year: accountingPeriod.year,
        month: accountingPeriod.month,
        accountId: journalEntryLine.accountId,
        debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
        credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .innerJoin(
        accountingPeriod,
        eq(accountingPeriod.id, journalEntryLine.periodId)
      )
      .where(
        and(
          eq(journalEntry.fiscalYearId, fy.id),
          eq(journalEntry.isVoided, false),
          sql`${journalEntry.origin} NOT IN ('auto_opening','auto_closing','auto_inflation')`
        )
      )
      .groupBy(
        journalEntry.id,
        accountingPeriod.year,
        accountingPeriod.month,
        journalEntryLine.accountId
      );

    // Coeficientes por mes, si la vista es ajustada.
    const [adjustment] = await db
      .select()
      .from(inflationAdjustment)
      .where(
        and(
          eq(inflationAdjustment.fiscalYearId, fy.id),
          eq(inflationAdjustment.status, 'applied')
        )
      )
      .limit(1);

    const coefficients = new Map<string, number>();
    let coeficienteInicio: number | null = null;
    if (ajustado && adjustment) {
      const idx = await db
        .select()
        .from(inflationIndex)
        .where(eq(inflationIndex.source, adjustment.source));
      const byKey = new Map(
        idx.map((r) => [`${r.year}-${r.month}`, Number(r.value)])
      );
      const closingIndex = byKey.get(
        `${adjustment.closingYear}-${adjustment.closingMonth}`
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
            `${adjustment.openingYear}-${adjustment.openingMonth}`
          ) ?? null;
      }
    }
    const coefOf = (year: number, month: number) =>
      coefficients.get(`${year}-${month}`) ?? 1;

    // Solo interesan los asientos que tocan efectivo. La contrapartida define la
    // actividad; su importe con signo invertido es el flujo de efectivo.
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
      const flow = -delta * (ajustado ? coefOf(l.year, l.month) : 1);
      byAccount.set(l.accountId, (byAccount.get(l.accountId) ?? 0) + flow);
      const acc = accById.get(l.accountId);
      if (acc && !acc.activity) {
        sinActividad.set(acc.id, { code: acc.code, name: acc.name });
      }
    }

    const activities: EfeActivity[] = CASH_FLOW_ACTIVITY_ORDER.map((key) => {
      const rows: EfeLine[] = [];
      for (const [accountId, amount] of byAccount) {
        const acc = accById.get(accountId);
        if (!acc) continue;
        const activity =
          acc.activity ?? defaultCashFlowActivity(acc.group) ?? 'operating';
        if (activity !== key) continue;
        if (Math.abs(amount) < 0.005) continue;
        rows.push({
          accountId,
          code: acc.code,
          name: acc.name,
          amount: r2(amount),
        });
      }
      rows.sort((a, b) => a.code.localeCompare(b.code));
      return {
        key,
        label: CASH_FLOW_ACTIVITY_LABELS[key],
        lines: rows,
        total: r2(rows.reduce((s, r) => s + r.amount, 0)),
      };
    });

    const efectivoInicio =
      ajustado && coeficienteInicio
        ? r2(efectivoInicioHistorico * coeficienteInicio)
        : efectivoInicioHistorico;
    const variacion = r2(efectivoCierre - efectivoInicio);
    const flujos = r2(activities.reduce((s, a) => s + a.total, 0));
    // Cierra por diferencia: es el efecto de la inflación sobre el efectivo.
    const recpamEfectivo = ajustado ? r2(variacion - flujos) : 0;
    const totalCausas = r2(flujos + recpamEfectivo);

    const fmtD = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

    return {
      fiscalYearNumber: fy.number,
      periodLabel: `${fmtD(fy.startDate)} – ${fmtD(fy.endDate)}`,
      efectivoInicio,
      efectivoInicioHistorico,
      coeficienteInicio,
      efectivoCierre,
      variacion,
      activities,
      recpamEfectivo,
      totalCausas,
      cuadra: Math.abs(totalCausas - variacion) < 0.05,
      sinActividad: [...sinActividad.values()],
      inflationApplied: !!adjustment,
    };
  });
