import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  bankAccount,
  bankTransaction,
  bankInvoiceMatch,
  invoice,
  client,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import {
  eq,
  and,
  desc,
  gte,
  lte,
  sql,
  inArray,
} from 'drizzle-orm';

/** Validate a bank account belongs to the calling user's org */
async function ensureBankAccountBelongsToOrg(
  bankAccountId: string,
  orgId: string
): Promise<{ bankAccountId: string; clientId: string }> {
  const [row] = await db
    .select({ bankAccountId: bankAccount.id, clientId: bankAccount.clientId })
    .from(bankAccount)
    .innerJoin(client, eq(client.id, bankAccount.clientId))
    .where(
      and(
        eq(bankAccount.id, bankAccountId),
        eq(client.organizationId, orgId)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error('Cuenta bancaria no encontrada o no autorizada');
  }
  return row;
}

export const createBankAccount = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid().optional(),
      bankName: z.string(),
      accountNumber: z.string().optional(),
      currency: z.string().default('ARS'),
      alias: z.string().optional(),
      cbu: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate client belongs to org
    const [c] = await db
      .select({ id: client.id })
      .from(client)
      .where(and(eq(client.id, ctx.data.clientId), eq(client.organizationId, orgId)))
      .limit(1);

    if (!c) throw new Error('Cliente no encontrado o no autorizado');

    const [account] = await db
      .insert(bankAccount)
      .values({
        clientId: ctx.data.clientId,
        profileId: ctx.data.profileId,
        bankName: ctx.data.bankName,
        accountNumber: ctx.data.accountNumber,
        currency: ctx.data.currency,
        alias: ctx.data.alias,
        cbu: ctx.data.cbu,
      })
      .returning();

    return account;
  });

export const listBankAccounts = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [c] = await db
      .select({ id: client.id })
      .from(client)
      .where(and(eq(client.id, ctx.data.clientId), eq(client.organizationId, orgId)))
      .limit(1);

    if (!c) throw new Error('Cliente no encontrado o no autorizado');

    return db
      .select()
      .from(bankAccount)
      .where(and(eq(bankAccount.clientId, ctx.data.clientId), eq(bankAccount.active, true)))
      .orderBy(bankAccount.createdAt);
  });

export const importBankTransactions = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      bankAccountId: z.string().uuid(),
      transactions: z.array(
        z.object({
          transactionDate: z.string(),
          description: z.string().optional(),
          amount: z.string(),
          direction: z.enum(['credit', 'debit']),
          counterpartyName: z.string().optional(),
          counterpartyIdentityNumber: z.string().optional(),
          externalId: z.string().optional(),
          rawData: z.record(z.string(), z.unknown()).optional(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    await ensureBankAccountBelongsToOrg(ctx.data.bankAccountId, orgId);

    if (ctx.data.transactions.length === 0) return { imported: 0, skipped: 0 };

    // Skip duplicates by externalId
    const externalIds = ctx.data.transactions
      .map((t) => t.externalId)
      .filter(Boolean) as string[];

    let existingExternalIds = new Set<string>();
    if (externalIds.length > 0) {
      const existing = await db
        .select({ externalId: bankTransaction.externalId })
        .from(bankTransaction)
        .where(
          and(
            eq(bankTransaction.bankAccountId, ctx.data.bankAccountId),
            inArray(bankTransaction.externalId, externalIds)
          )
        );
      existingExternalIds = new Set(existing.map((e) => e.externalId).filter(Boolean) as string[]);
    }

    const toInsert = ctx.data.transactions.filter(
      (t) => !t.externalId || !existingExternalIds.has(t.externalId)
    );

    if (toInsert.length === 0) return { imported: 0, skipped: ctx.data.transactions.length };

    await db.insert(bankTransaction).values(
      toInsert.map((t) => ({
        bankAccountId: ctx.data.bankAccountId,
        transactionDate: new Date(t.transactionDate),
        description: t.description,
        amount: t.amount,
        direction: t.direction,
        counterpartyName: t.counterpartyName,
        counterpartyIdentityNumber: t.counterpartyIdentityNumber,
        externalId: t.externalId,
        rawData: t.rawData ?? null,
      }))
    );

    return { imported: toInsert.length, skipped: ctx.data.transactions.length - toInsert.length };
  });

export const listBankTransactions = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      bankAccountId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    await ensureBankAccountBelongsToOrg(ctx.data.bankAccountId, orgId);

    const conditions: ReturnType<typeof eq>[] = [
      eq(bankTransaction.bankAccountId, ctx.data.bankAccountId) as any,
    ];
    if (ctx.data.from) {
      conditions.push(gte(bankTransaction.transactionDate, new Date(ctx.data.from)) as any);
    }
    if (ctx.data.to) {
      conditions.push(lte(bankTransaction.transactionDate, new Date(ctx.data.to)) as any);
    }

    // Fetch transactions with their match status
    const transactions = await db
      .select()
      .from(bankTransaction)
      .where(and(...conditions))
      .orderBy(desc(bankTransaction.transactionDate))
      .limit(ctx.data.limit);

    // Get match info for these transactions
    const txIds = transactions.map((t) => t.id);
    const matches =
      txIds.length > 0
        ? await db
            .select()
            .from(bankInvoiceMatch)
            .where(inArray(bankInvoiceMatch.bankTransactionId, txIds))
        : [];

    const matchMap = new Map<string, typeof matches>();
    for (const m of matches) {
      if (!matchMap.has(m.bankTransactionId)) matchMap.set(m.bankTransactionId, []);
      matchMap.get(m.bankTransactionId)!.push(m);
    }

    return transactions.map((t) => ({
      ...t,
      matches: matchMap.get(t.id) ?? [],
      matched: (matchMap.get(t.id) ?? []).length > 0,
    })) as any;
  });

export const autoMatchTransactions = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ bankAccountId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId } = await ensureBankAccountBelongsToOrg(ctx.data.bankAccountId, orgId);

    // Get unmatched transactions
    const allTxs = await db
      .select()
      .from(bankTransaction)
      .where(eq(bankTransaction.bankAccountId, ctx.data.bankAccountId));

    // Get already matched transaction IDs
    const matchedTxIds = new Set(
      (
        await db
          .select({ id: bankInvoiceMatch.bankTransactionId })
          .from(bankInvoiceMatch)
          .where(
            inArray(
              bankInvoiceMatch.bankTransactionId,
              allTxs.map((t) => t.id)
            )
          )
      ).map((r) => r.id)
    );

    const unmatchedTxs = allTxs.filter((t) => !matchedTxIds.has(t.id));
    if (unmatchedTxs.length === 0) return { matched: 0 };

    // Get invoices for this client
    const clientInvoices = await db
      .select({
        id: invoice.id,
        amount: invoice.amount,
        emitionDate: invoice.emitionDate,
        emitterIdentityNumber: invoice.emitterIdentityNumber,
        recipientIdentityNumber: invoice.recipientIdentityNumber,
        direction: invoice.direction,
      })
      .from(invoice)
      .where(eq(invoice.client, clientId));

    let matched = 0;
    const toInsert: {
      bankTransactionId: string;
      invoiceId: string;
      matchType: string;
      confidence: string;
    }[] = [];

    const DATE_PROXIMITY_DAYS = 5;

    for (const tx of unmatchedTxs) {
      const txAmount = Math.abs(parseFloat(tx.amount));
      const txDate = new Date(tx.transactionDate).getTime();

      let bestMatch: { invoiceId: string; confidence: number } | null = null;

      for (const inv of clientInvoices) {
        const invAmount = Math.abs(parseFloat(inv.amount));
        const invDate = new Date(inv.emitionDate).getTime();

        // Amount must match within 1 peso tolerance
        const amountMatch = Math.abs(txAmount - invAmount) < 1;
        if (!amountMatch) continue;

        // Date must be within DATE_PROXIMITY_DAYS
        const daysDiff = Math.abs(txDate - invDate) / (1000 * 60 * 60 * 24);
        if (daysDiff > DATE_PROXIMITY_DAYS) continue;

        // Compute confidence
        let confidence = 50; // base: amount + date match

        // CUIT match bonus
        const counterpartyCuit = tx.counterpartyIdentityNumber?.replace(/\D/g, '') ?? '';
        if (counterpartyCuit) {
          const emitterCuit = inv.emitterIdentityNumber?.replace(/\D/g, '') ?? '';
          const recipientCuit = inv.recipientIdentityNumber?.replace(/\D/g, '') ?? '';
          if (counterpartyCuit === emitterCuit || counterpartyCuit === recipientCuit) {
            confidence += 40;
          }
        }

        // Date proximity bonus: closer = higher confidence
        confidence += Math.round((1 - daysDiff / DATE_PROXIMITY_DAYS) * 10);

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { invoiceId: inv.id, confidence };
        }
      }

      if (bestMatch && bestMatch.confidence >= 50) {
        toInsert.push({
          bankTransactionId: tx.id,
          invoiceId: bestMatch.invoiceId,
          matchType: 'auto',
          confidence: bestMatch.confidence.toFixed(2),
        });
        matched++;
      }
    }

    if (toInsert.length > 0) {
      await db.insert(bankInvoiceMatch).values(toInsert);
    }

    return { matched };
  });

export const manualMatchTransaction = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      transactionId: z.string().uuid(),
      invoiceId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate transaction belongs to org
    const [tx] = await db
      .select({ id: bankTransaction.id, bankAccountId: bankTransaction.bankAccountId })
      .from(bankTransaction)
      .innerJoin(bankAccount, eq(bankAccount.id, bankTransaction.bankAccountId))
      .innerJoin(client, eq(client.id, bankAccount.clientId))
      .where(
        and(
          eq(bankTransaction.id, ctx.data.transactionId),
          eq(client.organizationId, orgId)
        )
      )
      .limit(1);

    if (!tx) throw new Error('Transacción no encontrada o no autorizada');

    // Validate invoice belongs to org
    const [inv] = await db
      .select({ id: invoice.id })
      .from(invoice)
      .innerJoin(client, eq(client.id, invoice.client))
      .where(
        and(
          eq(invoice.id, ctx.data.invoiceId),
          eq(client.organizationId, orgId)
        )
      )
      .limit(1);

    if (!inv) throw new Error('Comprobante no encontrado o no autorizado');

    // Remove any existing match for this transaction
    await db
      .delete(bankInvoiceMatch)
      .where(eq(bankInvoiceMatch.bankTransactionId, ctx.data.transactionId));

    const [match] = await db
      .insert(bankInvoiceMatch)
      .values({
        bankTransactionId: ctx.data.transactionId,
        invoiceId: ctx.data.invoiceId,
        matchType: 'manual',
        confidence: '100.00',
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      })
      .returning();

    return match;
  });

export const getReconciliationSummary = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [c] = await db
      .select({ id: client.id })
      .from(client)
      .where(and(eq(client.id, ctx.data.clientId), eq(client.organizationId, orgId)))
      .limit(1);

    if (!c) throw new Error('Cliente no encontrado o no autorizado');

    // Get all bank accounts for client
    const accounts = await db
      .select({ id: bankAccount.id })
      .from(bankAccount)
      .where(and(eq(bankAccount.clientId, ctx.data.clientId), eq(bankAccount.active, true)));

    if (accounts.length === 0) {
      return {
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        matchRate: 0,
        totalCredit: '0.00',
        totalDebit: '0.00',
        accountCount: 0,
      };
    }

    const accountIds = accounts.map((a) => a.id);

    const [totals] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        totalCredit: sql<string>`COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount::numeric ELSE 0 END), 0)::text`,
        totalDebit: sql<string>`COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount::numeric ELSE 0 END), 0)::text`,
      })
      .from(bankTransaction)
      .where(inArray(bankTransaction.bankAccountId, accountIds));

    const [matchedCount] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${bankInvoiceMatch.bankTransactionId})` })
      .from(bankInvoiceMatch)
      .innerJoin(bankTransaction, eq(bankInvoiceMatch.bankTransactionId, bankTransaction.id))
      .where(inArray(bankTransaction.bankAccountId, accountIds));

    const total = Number(totals?.total ?? 0);
    const matched = Number(matchedCount?.count ?? 0);

    return {
      totalTransactions: total,
      matchedTransactions: matched,
      unmatchedTransactions: total - matched,
      matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
      totalCredit: totals?.totalCredit ?? '0.00',
      totalDebit: totals?.totalDebit ?? '0.00',
      accountCount: accounts.length,
    };
  });
