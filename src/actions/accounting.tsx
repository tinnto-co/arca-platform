import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  accountingAccount,
  journalEntry,
  journalEntryLine,
  representative,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and, desc, gte, lte, sql, asc } from 'drizzle-orm';

/** Validate a representative belongs to the calling user's org */
async function ensureRepresentativeBelongsToOrg(
  representativeId: string,
  orgId: string
): Promise<void> {
  const [row] = await db
    .select({ id: representative.id })
    .from(representative)
    .where(and(eq(representative.id, representativeId), eq(representative.organizationId, orgId)))
    .limit(1);

  if (!row) {
    throw new Error('Cliente no encontrado o no autorizado');
  }
}

/** Validate an accounting account belongs to the calling user's org */
async function ensureAccountBelongsToOrg(
  accountId: string,
  orgId: string
): Promise<{ representativeId: string }> {
  const [row] = await db
    .select({ representativeId: accountingAccount.representativeId })
    .from(accountingAccount)
    .innerJoin(representative, eq(representative.id, accountingAccount.representativeId))
    .where(
      and(eq(accountingAccount.id, accountId), eq(representative.organizationId, orgId))
    )
    .limit(1);

  if (!row) {
    throw new Error('Cuenta contable no encontrada o no autorizada');
  }
  return row;
}

/** Validate a journal entry belongs to the calling user's org */
async function ensureJournalEntryBelongsToOrg(
  entryId: string,
  orgId: string
): Promise<{ representativeId: string }> {
  const [row] = await db
    .select({ representativeId: journalEntry.representativeId })
    .from(journalEntry)
    .innerJoin(representative, eq(representative.id, journalEntry.representativeId))
    .where(and(eq(journalEntry.id, entryId), eq(representative.organizationId, orgId)))
    .limit(1);

  if (!row) {
    throw new Error('Asiento contable no encontrado o no autorizado');
  }
  return row;
}

export const listAccounts = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ representativeId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureRepresentativeBelongsToOrg(ctx.data.representativeId, orgId);

    return db
      .select()
      .from(accountingAccount)
      .where(eq(accountingAccount.representativeId, ctx.data.representativeId))
      .orderBy(asc(accountingAccount.code));
  });

export const createAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
      parentId: z.string().uuid().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await ensureRepresentativeBelongsToOrg(ctx.data.representativeId, orgId);

    if (ctx.data.parentId) {
      await ensureAccountBelongsToOrg(ctx.data.parentId, orgId);
    }

    const [account] = await db
      .insert(accountingAccount)
      .values({
        representativeId: ctx.data.representativeId,
        code: ctx.data.code,
        name: ctx.data.name,
        type: ctx.data.type,
        parentId: ctx.data.parentId,
      })
      .returning();

    return account;
  });

export const updateAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      active: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await ensureAccountBelongsToOrg(ctx.data.id, orgId);

    const updates: Partial<typeof accountingAccount.$inferInsert> = {};
    if (ctx.data.name !== undefined) updates.name = ctx.data.name;
    if (ctx.data.active !== undefined) updates.active = ctx.data.active;

    const [updated] = await db
      .update(accountingAccount)
      .set(updates)
      .where(eq(accountingAccount.id, ctx.data.id))
      .returning();

    return updated;
  });

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  description: z.string().optional(),
});

export const createJournalEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      clientId: z.string().uuid().optional(),
      entryDate: z.string(),
      description: z.string().optional(),
      sourceType: z.string().optional(),
      sourceId: z.string().uuid().optional(),
      lines: z.array(journalLineSchema).min(2),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await ensureRepresentativeBelongsToOrg(ctx.data.representativeId, orgId);

    // Validate double-entry: sum of debits must equal sum of credits
    const totalDebit = ctx.data.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = ctx.data.lines.reduce((sum, l) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(
        `El asiento no esta balanceado: debitos ${totalDebit.toFixed(2)} ≠ creditos ${totalCredit.toFixed(2)}`
      );
    }

    // Validate all accounts belong to this representative/org
    for (const line of ctx.data.lines) {
      const [acc] = await db
        .select({ id: accountingAccount.id })
        .from(accountingAccount)
        .where(
          and(
            eq(accountingAccount.id, line.accountId),
            eq(accountingAccount.representativeId, ctx.data.representativeId)
          )
        )
        .limit(1);

      if (!acc) {
        throw new Error(
          `Cuenta ${line.accountId} no encontrada para este cliente`
        );
      }
    }

    const [entry] = await db
      .insert(journalEntry)
      .values({
        representativeId: ctx.data.representativeId,
        clientId: ctx.data.clientId,
        entryDate: new Date(ctx.data.entryDate),
        description: ctx.data.description,
        sourceType: ctx.data.sourceType,
        sourceId: ctx.data.sourceId,
        status: 'draft',
        createdByUserId: userId,
      })
      .returning();

    await db.insert(journalEntryLine).values(
      ctx.data.lines.map((line) => ({
        journalEntryId: entry.id,
        accountId: line.accountId,
        debit: String(line.debit),
        credit: String(line.credit),
        description: line.description,
      }))
    );

    return entry;
  });

export const listJournalEntries = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureRepresentativeBelongsToOrg(ctx.data.representativeId, orgId);

    const conditions = [eq(journalEntry.representativeId, ctx.data.representativeId)];

    if (ctx.data.from) {
      conditions.push(gte(journalEntry.entryDate, new Date(ctx.data.from)));
    }
    if (ctx.data.to) {
      conditions.push(lte(journalEntry.entryDate, new Date(ctx.data.to)));
    }

    return db
      .select()
      .from(journalEntry)
      .where(and(...conditions))
      .orderBy(desc(journalEntry.entryDate))
      .limit(ctx.data.limit);
  });

export const getJournalEntry = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureJournalEntryBelongsToOrg(ctx.data.id, orgId);

    const [entry] = await db
      .select()
      .from(journalEntry)
      .where(eq(journalEntry.id, ctx.data.id))
      .limit(1);

    if (!entry) throw new Error('Asiento no encontrado');

    const lines = await db
      .select({
        id: journalEntryLine.id,
        accountId: journalEntryLine.accountId,
        accountCode: accountingAccount.code,
        accountName: accountingAccount.name,
        accountType: accountingAccount.type,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        description: journalEntryLine.description,
      })
      .from(journalEntryLine)
      .innerJoin(
        accountingAccount,
        eq(accountingAccount.id, journalEntryLine.accountId)
      )
      .where(eq(journalEntryLine.journalEntryId, ctx.data.id));

    return { ...entry, lines };
  });

export const getLedger = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      accountId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureRepresentativeBelongsToOrg(ctx.data.representativeId, orgId);
    await ensureAccountBelongsToOrg(ctx.data.accountId, orgId);

    const entryConditions = [eq(journalEntry.representativeId, ctx.data.representativeId)];

    if (ctx.data.from) {
      entryConditions.push(
        gte(journalEntry.entryDate, new Date(ctx.data.from))
      );
    }
    if (ctx.data.to) {
      entryConditions.push(lte(journalEntry.entryDate, new Date(ctx.data.to)));
    }

    const rows = await db
      .select({
        entryId: journalEntry.id,
        entryDate: journalEntry.entryDate,
        entryDescription: journalEntry.description,
        entryStatus: journalEntry.status,
        lineId: journalEntryLine.id,
        debit: journalEntryLine.debit,
        credit: journalEntryLine.credit,
        lineDescription: journalEntryLine.description,
      })
      .from(journalEntryLine)
      .innerJoin(
        journalEntry,
        eq(journalEntry.id, journalEntryLine.journalEntryId)
      )
      .where(
        and(
          eq(journalEntryLine.accountId, ctx.data.accountId),
          and(...entryConditions)
        )
      )
      .orderBy(asc(journalEntry.entryDate));

    const totalDebit = rows.reduce((s, r) => s + parseFloat(r.debit ?? '0'), 0);
    const totalCredit = rows.reduce(
      (s, r) => s + parseFloat(r.credit ?? '0'),
      0
    );

    return { accountId: ctx.data.accountId, rows, totalDebit, totalCredit };
  });

export const getTrialBalance = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      from: z.string(),
      to: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureRepresentativeBelongsToOrg(ctx.data.representativeId, orgId);

    const rows = await db
      .select({
        accountId: accountingAccount.id,
        accountCode: accountingAccount.code,
        accountName: accountingAccount.name,
        accountType: accountingAccount.type,
        totalDebit: sql<string>`COALESCE(SUM(${journalEntryLine.debit}::numeric), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(${journalEntryLine.credit}::numeric), 0)`,
      })
      .from(accountingAccount)
      .leftJoin(
        journalEntryLine,
        eq(journalEntryLine.accountId, accountingAccount.id)
      )
      .leftJoin(
        journalEntry,
        and(
          eq(journalEntry.id, journalEntryLine.journalEntryId),
          gte(journalEntry.entryDate, new Date(ctx.data.from)),
          lte(journalEntry.entryDate, new Date(ctx.data.to))
        )
      )
      .where(
        and(
          eq(accountingAccount.representativeId, ctx.data.representativeId),
          eq(accountingAccount.active, true)
        )
      )
      .groupBy(
        accountingAccount.id,
        accountingAccount.code,
        accountingAccount.name,
        accountingAccount.type
      )
      .orderBy(asc(accountingAccount.code));

    const grandTotalDebit = rows.reduce(
      (s, r) => s + parseFloat(r.totalDebit),
      0
    );
    const grandTotalCredit = rows.reduce(
      (s, r) => s + parseFloat(r.totalCredit),
      0
    );

    return { rows, grandTotalDebit, grandTotalCredit };
  });
