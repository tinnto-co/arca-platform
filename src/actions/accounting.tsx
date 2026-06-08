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
  journalEntry,
  journalEntryLine,
  ledgerMappingRule,
  ledgerMappingRuleLine,
  representative,
  user,
} from '@/drizzle/schema';
import { getSessionWithOrg, getMemberRole, assertCanWrite } from '@/actions/helpers';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { CUSTOM_CODE_PREFIX, PENDING_REVIEW_CODE } from '@/lib/accounting-labels';

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
      and(eq(fiscalYear.id, fiscalYearId), eq(representative.organizationId, orgId))
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
      and(eq(accountingPeriod.id, periodId), eq(representative.organizationId, orgId))
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
    .innerJoin(journalEntryLine, eq(journalEntryLine.journalEntryId, journalEntry.id))
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
      .select({ maxNum: sql<number>`coalesce(max(${fiscalYear.number}),0)::int` })
      .from(fiscalYear)
      .where(eq(fiscalYear.clientId, clientId));
    const number = (maxNum ?? 0) + 1;

    const [fy] = await db
      .insert(fiscalYear)
      .values({ clientId, startDate: start, endDate: end, status: 'open', number })
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
      .leftJoin(journalEntryLine, eq(journalEntryLine.journalEntryId, journalEntry.id))
      .where(and(eq(journalEntry.fiscalYearId, fy.id), eq(journalEntry.isVoided, false)))
      .groupBy(journalEntry.periodId);
    const byPeriod = new Map(stats.map((s) => [s.periodId, s]));

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
      isCurrent: currentPeriod?.id === p.id,
    }));

    return {
      fiscalYear: fy,
      periods: periodsOut,
      currentPeriodId: currentPeriod?.id ?? null,
    };
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
    if (period.status === 'closed') throw new Error('El período ya está cerrado');

    const [earliest] = await db
      .select({ id: accountingPeriod.id })
      .from(accountingPeriod)
      .where(
        and(eq(accountingPeriod.fiscalYearId, fy.id), eq(accountingPeriod.status, 'open'))
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
      eventData: { periodId: period.id, year: period.year, month: period.month },
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
    if (period.status !== 'closed') throw new Error('El período no está cerrado');

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
      .where(eq(accountingLog.fiscalYearId, fy.id))
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
    .where(and(eq(journalEntry.id, entryId), eq(representative.organizationId, orgId)))
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
    throw new Error('No hay un ejercicio que cubra esa fecha. Creá el ejercicio primero');
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
      throw new Error('Cada línea debe tener importe en Debe o en Haber, no en ambos');
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
      and(eq(accountOverride.clientId, clientId), inArray(accountOverride.accountId, ids))
    );
  const ovMap = new Map(overrides.map((o) => [o.accountId, o]));
  const byId = new Map(accs.map((a) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) throw new Error('Una de las cuentas no existe o no pertenece al estudio');
    if (a.scope === 'custom' && a.clientId !== clientId) {
      throw new Error('Una de las cuentas es custom de otra empresa');
    }
    if (a.type !== 'imputable') {
      throw new Error(`La cuenta ${a.code} es de agrupación; solo se imputan cuentas imputables`);
    }
    const active = ovMap.get(id)?.isActive ?? a.isActive;
    if (!active) throw new Error(`La cuenta ${a.code} está inactiva para esta empresa`);
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
      .filter((a) => (ovMap.get(a.id)?.isActive ?? a.isActive))
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
    const { fy, period, date } = await resolvePeriodForDate(clientId, ctx.data.entryDate);
    if (period.status === 'closed') {
      throw new Error('No se puede cargar el asiento: el período está cerrado');
    }
    validateLineAmounts(ctx.data.lines);
    await assertPostableAccounts(clientId, orgId, ctx.data.lines.map((l) => l.accountId));

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
          description: ctx.data.description?.trim() ? ctx.data.description.trim() : null,
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
    if (entry.isVoided) throw new Error('No se puede editar un asiento anulado');

    // El período actual del asiento debe estar abierto.
    const { period: currentPeriod } = await loadPeriodForOrg(entry.periodId, orgId);
    if (currentPeriod.status === 'closed') {
      throw new Error('No se puede editar: el período del asiento está cerrado');
    }

    // Resolver el período de la (posible nueva) fecha; debe ser del mismo ejercicio y abierto.
    const { fy, period, date } = await resolvePeriodForDate(
      entry.clientId,
      ctx.data.entryDate
    );
    if (fy.id !== entry.fiscalYearId) {
      throw new Error('La fecha debe estar dentro del mismo ejercicio del asiento');
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
          description: ctx.data.description?.trim() ? ctx.data.description.trim() : null,
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
      throw new Error('No se puede anular: el período del asiento está cerrado');
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
      return { rows: [] as JournalEntryListRow[], total: 0, fiscalYearId: null };
    }

    const conditions = [
      eq(journalEntry.clientId, d.clientId),
      eq(journalEntry.fiscalYearId, fyId),
    ];
    if (!d.includeVoided) conditions.push(eq(journalEntry.isVoided, false));
    if (d.origin) conditions.push(eq(journalEntry.origin, d.origin));
    if (d.from) conditions.push(gte(journalEntry.entryDate, new Date(`${d.from}T00:00:00Z`)));
    if (d.to) conditions.push(lte(journalEntry.entryDate, new Date(`${d.to}T00:00:00Z`)));

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
        return { rows: [] as JournalEntryListRow[], total: 0, fiscalYearId: fyId };
      }
      conditions.push(inArray(journalEntry.id, ids));
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(journalEntry)
      .where(and(...conditions));

    const orderCol = d.sortBy === 'date' ? journalEntry.entryDate : journalEntry.number;
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
    const totalsByEntry = new Map<string, { total: number; lineCount: number }>();
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
      .leftJoin(accountingPeriod, eq(accountingPeriod.id, journalEntry.periodId))
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
      .innerJoin(journalEntry, eq(journalEntry.id, journalEntryLine.journalEntryId))
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
      .innerJoin(journalEntry, eq(journalEntry.id, journalEntryLine.journalEntryId))
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
      return { fiscalYear: null, accounts: [], grandTotalDebit: 0, grandTotalCredit: 0 };
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
      .innerJoin(journalEntry, eq(journalEntry.id, journalEntryLine.journalEntryId))
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
      .innerJoin(journalEntry, eq(journalEntry.id, journalEntryLine.journalEntryId))
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
        .where(inArray(account.id, missing.map((m) => m.accountId)));
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
      .innerJoin(journalEntry, eq(journalEntry.id, journalEntryLine.journalEntryId))
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
    z.object({ clientId: z.string().uuid(), fiscalYearId: z.string().uuid().optional() })
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
      .where(and(eq(journalEntry.clientId, clientId), eq(journalEntry.fiscalYearId, fy.id)))
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
      .innerJoin(journalEntry, eq(journalEntry.id, journalEntryLine.journalEntryId))
      .innerJoin(account, eq(account.id, journalEntryLine.accountId))
      .where(and(eq(journalEntry.clientId, clientId), eq(journalEntry.fiscalYearId, fy.id)))
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
      fiscalYear: { number: fy.number, startDate: fy.startDate, endDate: fy.endDate },
      entries: result,
    };
  });

/* ═══════════════ REGLAS DE MAPEO (US 3.1.x) ═══════════════ */

type MappingRuleRow = typeof ledgerMappingRule.$inferSelect;

async function loadMappingRuleForOrg(ruleId: string, orgId: string): Promise<MappingRuleRow> {
  const [row] = await db
    .select({ r: ledgerMappingRule })
    .from(ledgerMappingRule)
    .innerJoin(client, eq(client.id, ledgerMappingRule.clientId))
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(and(eq(ledgerMappingRule.id, ruleId), eq(representative.organizationId, orgId)))
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
  if (lines.length < 2) throw new Error('La regla debe tener al menos 2 líneas');
  const hasDebit = lines.some((l) => l.side === 'debit');
  const hasCredit = lines.some((l) => l.side === 'credit');
  if (!hasDebit || !hasCredit) {
    throw new Error(
      'La regla debe tener al menos una línea al Debe y una al Haber para que el asiento pueda cuadrar'
    );
  }
  for (const l of lines) {
    if (l.amountBasis === 'fixed' && (l.fixedAmount == null || l.fixedAmount <= 0)) {
      throw new Error('Las líneas con base "monto fijo" requieren un importe mayor a 0');
    }
  }
}

const mappingLineSchema = z.object({
  accountId: z.string().uuid(),
  side: z.enum(['debit', 'credit']),
  amountBasis: z.enum(['total', 'net', 'vat', 'other_taxes', 'concept_value', 'fixed']),
  fixedAmount: z.number().nullable().optional(),
  description: z.string().optional(),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
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
    if (ctx.data.sourceModule) conds.push(eq(ledgerMappingRule.sourceModule, ctx.data.sourceModule));

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
      .innerJoin(accountingPeriod, eq(accountingPeriod.id, journalEntry.periodId))
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
    await assertPostableAccounts(d.clientId, orgId, d.lines.map((l) => l.accountId));

    const rule = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(ledgerMappingRule)
        .values({
          clientId: d.clientId,
          name: d.name.trim(),
          sourceModule: d.sourceModule,
          ruleType: d.ruleType,
          condition: d.ruleType === 'conditional' ? (d.condition ?? null) : null,
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
          fixedAmount: l.amountBasis === 'fixed' && l.fixedAmount != null ? String(l.fixedAmount) : null,
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
    await assertPostableAccounts(rule.clientId, orgId, d.lines.map((l) => l.accountId));

    await db.transaction(async (tx) => {
      await tx
        .update(ledgerMappingRule)
        .set({
          name: d.name.trim(),
          sourceModule: d.sourceModule,
          ruleType: d.ruleType,
          condition: d.ruleType === 'conditional' ? (d.condition ?? null) : null,
          priority: d.priority,
        })
        .where(eq(ledgerMappingRule.id, rule.id));
      await tx.delete(ledgerMappingRuleLine).where(eq(ledgerMappingRuleLine.ruleId, rule.id));
      await tx.insert(ledgerMappingRuleLine).values(
        d.lines.map((l, i) => ({
          ruleId: rule.id,
          accountId: l.accountId,
          side: l.side,
          amountBasis: l.amountBasis,
          fixedAmount: l.amountBasis === 'fixed' && l.fixedAmount != null ? String(l.fixedAmount) : null,
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
    if (fromClientId === toClientId) throw new Error('Elegí dos empresas distintas');
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
      .where(inArray(ledgerMappingRuleLine.ruleId, srcRules.map((r) => r.id)))
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
      const resolved = lines.map((l) => ({ ...l, targetId: codeToId.get(l.code) }));
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
