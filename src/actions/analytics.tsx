import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  client,
  representative,
  ivaScrape,
  taxProjection,
  clientRiskSnapshot,
  invoice,
  debt,
  notification,
  dueDate,
} from '@/drizzle/schema';
import {
  eq,
  and,
  gte,
  lte,
  desc,
  sql,
  inArray,
  isNull,
} from 'drizzle-orm';
import { getSessionWithOrg } from '@/actions/helpers';

// ── generateIvaProjection ────────────────────────────────────────────────────
// Projects IVA liability for a given period based on last 6 months of scrapes.

export const generateIvaProjection = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      profileId: z.string().uuid(),
      period: z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Validate profile belongs to org
    const profileRow = await db
      .select({ id: client.id, clientId: client.representativeId })
      .from(client)
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .where(
        and(eq(client.id, ctx.data.profileId), eq(representative.organizationId, orgId as string))
      )
      .limit(1)
      .then((r) => r[0]);

    if (!profileRow) throw new Error('Perfil no encontrado o no autorizado');

    // Fetch last 6 months of IVA scrapes for trend analysis
    // periodoFiscal is stored as "MM/YYYY" format
    const scrapes = await db
      .select({
        periodoFiscal: ivaScrape.periodoFiscal,
        debitoFiscal: ivaScrape.debitoFiscal,
        creditoFiscal: ivaScrape.creditoFiscal,
        saldoTecnico: ivaScrape.saldoTecnicoFavorContribuyente,
        ok: ivaScrape.ok,
      })
      .from(ivaScrape)
      .where(eq(ivaScrape.clientId, ctx.data.profileId))
      .orderBy(desc(ivaScrape.createdAt))
      .limit(6);

    const validScrapes = scrapes.filter(
      (s) => s.ok && s.debitoFiscal !== null
    );

    let projectedAmount = 0;
    let confidence: string;
    let factors: Record<string, unknown>;

    if (validScrapes.length === 0) {
      // No data: project 0 with low confidence
      projectedAmount = 0;
      confidence = 'low';
      factors = {
        method: 'no_data',
        samplesUsed: 0,
        message: 'Sin historial de declaraciones IVA disponible',
      };
    } else {
      // Average (debitoFiscal - creditoFiscal) across valid scrapes
      // Positive = IVA to pay; negative = credit in favor of taxpayer
      const positions = validScrapes.map((s) => {
        const debito = parseFloat(s.debitoFiscal ?? '0');
        const credito = parseFloat(s.creditoFiscal ?? '0');
        return debito - credito;
      });

      const avgPosition =
        positions.reduce((sum, v) => sum + v, 0) / positions.length;

      projectedAmount = Math.max(0, avgPosition); // negative = credit, store as 0

      // Apply a simple trend weight: weight last month more
      if (validScrapes.length >= 3) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
      if (validScrapes.length >= 5) {
        confidence = 'high';
      }

      factors = {
        method: 'historical_average',
        samplesUsed: validScrapes.length,
        avgDebit:
          validScrapes.reduce(
            (sum, s) => sum + parseFloat(s.debitoFiscal ?? '0'),
            0
          ) / validScrapes.length,
        avgCredit:
          validScrapes.reduce(
            (sum, s) => sum + parseFloat(s.creditoFiscal ?? '0'),
            0
          ) / validScrapes.length,
        avgPosition,
        periods: validScrapes.map((s) => s.periodoFiscal),
      };
    }

    // Upsert into taxProjection
    await db
      .insert(taxProjection)
      .values({
        profileId: ctx.data.profileId,
        period: ctx.data.period,
        tax: 'iva',
        projectedAmount: String(projectedAmount.toFixed(2)),
        confidence,
        factors,
      })
      .onConflictDoUpdate({
        target: [
          taxProjection.clientId,
          taxProjection.period,
          taxProjection.tax,
        ],
        set: {
          projectedAmount: String(projectedAmount.toFixed(2)),
          confidence,
          factors,
          generatedAt: new Date(),
        },
      });

    return {
      profileId: ctx.data.profileId,
      period: ctx.data.period,
      tax: 'iva',
      projectedAmount,
      confidence,
      factors,
    } as any;
  });

// ── getRatios ────────────────────────────────────────────────────────────────
// Business ratios for a client over a date range.

export const getRatios = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      from: z.string(),
      to: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Validate representative belongs to org
    const representativeRow = await db
      .select({ id: representative.id, name: representative.name })
      .from(representative)
      .where(
        and(eq(representative.id, ctx.data.clientId), eq(representative.organizationId, orgId as string))
      )
      .limit(1)
      .then((r) => r[0]);

    if (!representativeRow) throw new Error('Cliente no encontrado o no autorizado');

    const fromDate = new Date(ctx.data.from);
    const toDate = new Date(ctx.data.to);
    toDate.setHours(23, 59, 59, 999);

    // Previous period of same length
    const rangeMs = toDate.getTime() - fromDate.getTime();
    const prevToDate = new Date(fromDate.getTime() - 1);
    const prevFromDate = new Date(prevToDate.getTime() - rangeMs);

    const arsAmount = sql<number>`CASE
      WHEN LOWER(${invoice.currency}) = 'usd'
      THEN CAST(${invoice.amount} AS DECIMAL) * CAST(${invoice.cureencyRate} AS DECIMAL)
      ELSE CAST(${invoice.amount} AS DECIMAL)
    END`;

    const [currentPeriod, previousPeriod] = await Promise.all([
      db
        .select({
          totalSales: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'outbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          totalPurchases: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'inbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          invoiceCount: sql<number>`COUNT(*)`,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.representativeId, ctx.data.clientId),
            gte(invoice.emitionDate, fromDate),
            lte(invoice.emitionDate, toDate)
          )
        ),

      db
        .select({
          totalSales: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'outbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          totalPurchases: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'inbound' THEN ${arsAmount} ELSE 0 END), 0)`,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.representativeId, ctx.data.clientId),
            gte(invoice.emitionDate, prevFromDate),
            lte(invoice.emitionDate, prevToDate)
          )
        ),
    ]);

    const cur = currentPeriod[0];
    const prev = previousPeriod[0];

    const totalSales = Number(cur?.totalSales ?? 0);
    const totalPurchases = Number(cur?.totalPurchases ?? 0);
    const invoiceCount = Number(cur?.invoiceCount ?? 0);
    const prevSales = Number(prev?.totalSales ?? 0);
    const prevPurchases = Number(prev?.totalPurchases ?? 0);

    const salesPurchasesRatio =
      totalPurchases > 0 ? totalSales / totalPurchases : null;

    const salesGrowthPct =
      prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : null;

    const purchasesGrowthPct =
      prevPurchases > 0
        ? ((totalPurchases - prevPurchases) / prevPurchases) * 100
        : null;

    const netPosition = totalSales - totalPurchases;

    return {
      clientId: ctx.data.clientId,
      clientName: representativeRow.name,
      from: ctx.data.from,
      to: ctx.data.to,
      totalSales,
      totalPurchases,
      invoiceCount,
      netPosition,
      salesPurchasesRatio,
      salesGrowthPct,
      purchasesGrowthPct,
      prevTotalSales: prevSales,
      prevTotalPurchases: prevPurchases,
    };
  });

// ── getClientsAtRisk ──────────────────────────────────────────────────────────
// Returns profiles with high or critical risk based on latest risk snapshot.

export const getClientsAtRisk = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      riskLevel: z
        .enum(['medium', 'high', 'critical'])
        .optional()
        .default('high'),
      limit: z.number().int().min(1).max(100).default(20),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Use provided period or current month
    const now = new Date();
    const period =
      ctx.data.period ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Risk level filter: include current level and above
    const riskLevelOrder = ['low', 'medium', 'high', 'critical'];
    const minIdx = riskLevelOrder.indexOf(ctx.data.riskLevel);
    const targetLevels = riskLevelOrder.slice(minIdx);

    const snapshots = await db
      .select({
        snapshotId: clientRiskSnapshot.id,
        profileId: clientRiskSnapshot.clientId,
        score: clientRiskSnapshot.score,
        riskLevel: clientRiskSnapshot.riskLevel,
        factors: clientRiskSnapshot.factors,
        profileName: client.name,
        clientId: client.id,
        clientName: client.name,
        clientCuit: client.identityNumber,
      })
      .from(clientRiskSnapshot)
      .innerJoin(client, eq(clientRiskSnapshot.clientId, client.id))
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .where(
        and(
          eq(clientRiskSnapshot.period, period),
          eq(representative.organizationId, orgId as string),
          inArray(clientRiskSnapshot.riskLevel, targetLevels)
        )
      )
      .orderBy(desc(clientRiskSnapshot.score))
      .limit(ctx.data.limit);

    return snapshots.map((s) => ({
      ...s,
      score: Number(s.score),
    })) as any;
  });

// ── getExecutiveSummary ───────────────────────────────────────────────────────
// High-level org summary for analytics dashboard.

export const getExecutiveSummary = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const orgRepresentatives = await db
    .select({ id: representative.id })
    .from(representative)
    .where(eq(representative.organizationId, orgId as string));

  const clientIds = orgRepresentatives.map((c) => c.id);
  const totalClients = clientIds.length;

  if (clientIds.length === 0) {
    return {
      totalClients: 0,
      totalManagedProfiles: 0,
      openDebtCount: 0,
      openDebtTotal: 0,
      criticalNotificationCount: 0,
      upcomingDueDateCount: 0,
      criticalRiskProfileCount: 0,
      highRiskProfileCount: 0,
      currentMonthSales: 0,
      currentMonthPurchases: 0,
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const arsAmount = sql<number>`CASE
    WHEN LOWER(${invoice.currency}) = 'usd'
    THEN CAST(${invoice.amount} AS DECIMAL) * CAST(${invoice.cureencyRate} AS DECIMAL)
    ELSE CAST(${invoice.amount} AS DECIMAL)
  END`;

  const [
    profileCountResult,
    debtResult,
    criticalNotifResult,
    upcomingDueDateResult,
    riskResult,
    salesResult,
  ] = await Promise.all([
    // Managed profiles
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(client)
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .where(
        and(
          eq(representative.organizationId, orgId as string),
          eq(client.managedByStudy, true),
          isNull(client.disabledAt)
        )
      ),

    // Open debts: count + total balance
    db
      .select({
        count: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(CAST(${debt.balance} AS DECIMAL)), 0)`,
      })
      .from(debt)
      .where(and(inArray(debt.representativeId, clientIds), eq(debt.status, 'open'))),

    // Critical unresolved notifications
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notification)
      .where(
        and(
          inArray(notification.representativeId, clientIds),
          eq(notification.severity, 'critical'),
          isNull(notification.resolvedAt)
        )
      ),

    // Upcoming due dates within 7 days, not completed
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(dueDate)
      .where(
        and(
          inArray(dueDate.representativeId, clientIds),
          gte(dueDate.dueDate, now),
          lte(dueDate.dueDate, sevenDaysFromNow),
          isNull(dueDate.completedAt)
        )
      ),

    // High/critical risk profiles from latest snapshots
    db
      .select({
        riskLevel: clientRiskSnapshot.riskLevel,
        count: sql<number>`COUNT(*)`,
      })
      .from(clientRiskSnapshot)
      .innerJoin(client, eq(clientRiskSnapshot.clientId, client.id))
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .where(
        and(
          eq(clientRiskSnapshot.period, currentPeriod),
          eq(representative.organizationId, orgId as string),
          inArray(clientRiskSnapshot.riskLevel, ['high', 'critical'])
        )
      )
      .groupBy(clientRiskSnapshot.riskLevel),

    // Current month sales/purchases
    db
      .select({
        totalSales: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'outbound' THEN ${arsAmount} ELSE 0 END), 0)`,
        totalPurchases: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'inbound' THEN ${arsAmount} ELSE 0 END), 0)`,
      })
      .from(invoice)
      .where(
        and(
          inArray(invoice.representativeId, clientIds),
          gte(invoice.emitionDate, monthStart),
          lte(invoice.emitionDate, monthEnd)
        )
      ),
  ]);

  const riskMap = Object.fromEntries(
    riskResult.map((r) => [r.riskLevel, Number(r.count)])
  );

  return {
    totalClients,
    totalManagedProfiles: Number(profileCountResult[0]?.count ?? 0),
    openDebtCount: Number(debtResult[0]?.count ?? 0),
    openDebtTotal: Number(debtResult[0]?.total ?? 0),
    criticalNotificationCount: Number(criticalNotifResult[0]?.count ?? 0),
    upcomingDueDateCount: Number(upcomingDueDateResult[0]?.count ?? 0),
    criticalRiskProfileCount: riskMap.critical ?? 0,
    highRiskProfileCount: riskMap.high ?? 0,
    currentMonthSales: Number(salesResult[0]?.totalSales ?? 0),
    currentMonthPurchases: Number(salesResult[0]?.totalPurchases ?? 0),
  };
});
