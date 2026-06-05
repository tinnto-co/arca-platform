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
  client,
  fiscalYear,
  journalEntry,
  journalEntryLine,
  representative,
} from '@/drizzle/schema';
import { getSessionWithOrg, getMemberRole } from '@/actions/helpers';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { CUSTOM_CODE_PREFIX } from '@/lib/accounting-labels';

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
