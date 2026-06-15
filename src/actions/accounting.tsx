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
  client,
  fiscalYear,
  fixedAsset,
  invoice,
  journalEntry,
  journalEntryLine,
  ledgerMappingRule,
  ledgerMappingRuleLine,
  representative,
  user,
} from '@/drizzle/schema';
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
  PENDING_REVIEW_CODE,
  EXPENSE_ACCOUNT_GROUPS,
  RESULT_ACCOUNT_GROUPS,
  RESULT_TARGET_GROUP,
  MONTH_NAMES,
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

/* ───────────────────────────── Helpers ───────────────────────────── */

/** Solo el Owner del estudio configura el plan de cuentas. */
function assertOwner(role: string): void {
  if (role !== 'owner') {
    throw new Error(
      'Solo el Owner del estudio puede modificar el plan de cuentas'
    );
  }
}

/** Valida que una empresa (client) pertenezca al estudio del usuario. */
async function ensureClientBelongsToOrg(
  clientId: string,
  orgId: string
): Promise<void> {
  const [row] = await db
    .select({ id: client.id })
    .from(client)
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(
      and(eq(client.id, clientId), eq(representative.organizationId, orgId))
    )
    .limit(1);
  if (!row) throw new Error('Empresa no encontrada o no autorizada');
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
 * - Código en rango reservado (empieza con "9.").
 * - No puede colisionar con un código del plan base ni de otra custom de la empresa.
 */
export const createCustomAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
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
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertOwner(role);

    const d = ctx.data;
    await ensureClientBelongsToOrg(d.clientId, orgId);

    const code = d.code.trim();
    if (!/^[0-9]+(\.[0-9]+)*$/.test(code)) {
      throw new Error(
        'El código solo admite números separados por puntos (ej. "9.1.01")'
      );
    }
    if (!code.startsWith(CUSTOM_CODE_PREFIX)) {
      throw new Error(
        'Las cuentas propias deben usar el rango reservado (código que empieza con "9.")'
      );
    }
    if (d.type === 'imputable' && (!d.accountGroup || !d.expectedBalance)) {
      throw new Error(
        'Las cuentas imputables requieren rubro de exposición y saldo esperado'
      );
    }

    // No colisión con el plan base del estudio ni con otra custom de la empresa.
    const [collision] = await db
      .select({ id: account.id, scope: account.scope })
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
      throw new Error(
        collision.scope === 'base'
          ? 'Ese código ya existe en el plan base del estudio'
          : 'Ya existe una cuenta con ese código en esta empresa'
      );
    }

    if (d.parentId) await loadAccountForClient(d.parentId, orgId, d.clientId);

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
        parentId: d.parentId ?? null,
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

    if (d.parentId) await loadBaseAccount(d.parentId, orgId);

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

/* ═══════════════ EJERCICIOS Y PERÍODOS (US 1.2.x) ═══════════════ */

type FiscalYearRow = typeof fiscalYear.$inferSelect;
type PeriodRow = typeof accountingPeriod.$inferSelect;

/** Valida que un ejercicio pertenezca al estudio del usuario y lo devuelve. */
async function loadFiscalYearForOrg(
  fiscalYearId: string,
  orgId: string
): Promise<FiscalYearRow> {
  const [row] = await db
    .select({ fy: fiscalYear })
    .from(fiscalYear)
    .innerJoin(client, eq(client.id, fiscalYear.clientId))
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(
      and(
        eq(fiscalYear.id, fiscalYearId),
        eq(representative.organizationId, orgId)
      )
    )
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
    // Fin esperado: último día del mes 12 del ejercicio.
    const expectedEnd = new Date(Date.UTC(sY, sM + 12, 0));
    if (end.getTime() !== expectedEnd.getTime()) {
      const eStr = expectedEnd.toISOString().slice(0, 10);
      throw new Error(
        `El ejercicio debe durar exactamente 12 meses calendario. Para ese inicio, el fin debe ser ${eStr}`
      );
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

    const periods = Array.from({ length: 12 }, (_, i) => {
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
      ruleType: r.ruleType as 'default' | 'conditional',
      condition: (r.condition ?? null) as Record<string, unknown> | null,
      priority: r.priority,
      lines: (byRule.get(r.id) ?? []).map((l) => ({
        accountId: l.accountId,
        side: l.side as 'debit' | 'credit',
        amountBasis: l.amountBasis as RuleLike['lines'][number]['amountBasis'],
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

/* ════════════════════════ Anexo I (US 4.2.x) ════════════════════════ */

export interface AnexoIAssetRow {
  id: string;
  name: string;
  originalValue: number;
  accumStart: number;
  amortYear: number;
  accumEnd: number;
  residualEnd: number;
  disposed: boolean;
}
export interface AnexoICategory {
  category: string;
  assets: AnexoIAssetRow[];
  totals: {
    originalValue: number;
    accumStart: number;
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
    const accumEnd = accumulatedDepreciation(a, fy.endDate);
    const originalValue = parseFloat(r.fa.originalValue);
    return {
      id: r.fa.id,
      name: r.fa.name,
      category: r.fa.category,
      originalValue,
      accumStart,
      amortYear: r2(accumEnd - accumStart),
      accumEnd,
      residualEnd: r2(originalValue - accumEnd),
      disposed: r.fa.status !== 'active',
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
  originalValue: 0,
  accumStart: 0,
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
      originalValue: row.originalValue,
      accumStart: row.accumStart,
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
