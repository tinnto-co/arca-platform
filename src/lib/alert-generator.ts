import { db } from '@/lib/db';
import { alert, representative, debt, notification, dueDate } from '@/drizzle/schema';
import { and, eq, lt, isNull, gte, lte, inArray } from 'drizzle-orm';

/**
 * Generates alerts for an organization by scanning:
 * - Overdue open debts (dueDate < now)
 * - Critical unresolved notifications
 * - Due dates within the next 7 days (not completed)
 *
 * Note: scraper_error alerts are now created directly by the scrapper service.
 *
 * Deduplicates by (type, sourceEntityType, sourceEntityId) on open alerts.
 */
export async function generateAlerts(
  orgId: string
): Promise<{ created: number }> {
  const orgRepresentatives = await db
    .select({
      id: representative.id,
      name: representative.name,
    })
    .from(representative)
    .where(eq(representative.organizationId, orgId));

  if (orgRepresentatives.length === 0) return { created: 0 };

  const representativeIds = orgRepresentatives.map((c) => c.id);

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Load existing open alerts to deduplicate
  const existingAlerts = await db
    .select({
      type: alert.type,
      sourceEntityType: alert.sourceEntityType,
      sourceEntityId: alert.sourceEntityId,
    })
    .from(alert)
    .where(and(eq(alert.organizationId, orgId), eq(alert.status, 'open')));

  const existingFingerprints = new Set(
    existingAlerts.map(
      (a) => `${a.type}:${a.sourceEntityType}:${a.sourceEntityId}`
    )
  );

  const alertsToInsert: (typeof alert.$inferInsert)[] = [];

  function maybeAdd(fingerprint: string, entry: typeof alert.$inferInsert) {
    if (!existingFingerprints.has(fingerprint)) {
      alertsToInsert.push(entry);
      existingFingerprints.add(fingerprint);
    }
  }

  // 1. Overdue debts: status='open' AND dueDate < now
  const overdueDebts = await db
    .select()
    .from(debt)
    .where(
      and(
        inArray(debt.representativeId, representativeIds),
        eq(debt.status, 'open'),
        lt(debt.dueDate, now)
      )
    );

  for (const d of overdueDebts) {
    maybeAdd(`overdue_debt:debt:${d.id}`, {
      organizationId: orgId,
      representativeId: d.representativeId ?? undefined,
      type: 'overdue_debt',
      severity: 'high',
      title: `Deuda vencida: ${d.tax || d.concept || 'Sin concepto'}`,
      description: d.period ? `Período ${d.period}` : undefined,
      sourceEntityType: 'debt',
      sourceEntityId: d.id,
      status: 'open',
    });
  }

  // 2. Critical notifications: severity='critical' AND resolvedAt IS NULL
  const criticalNotifs = await db
    .select()
    .from(notification)
    .where(
      and(
        inArray(notification.representativeId, representativeIds),
        eq(notification.severity, 'critical'),
        isNull(notification.resolvedAt)
      )
    );

  for (const n of criticalNotifs) {
    const summary = n.aiSummary ?? n.message.slice(0, 80);
    maybeAdd(`critical_notification:notification:${n.id}`, {
      organizationId: orgId,
      representativeId: n.representativeId ?? undefined,
      clientId: n.clientId ?? undefined,
      type: 'critical_notification',
      severity: 'critical',
      title: `Notificación crítica: ${summary}`,
      sourceEntityType: 'notification',
      sourceEntityId: n.id,
      status: 'open',
    });
  }

  // 3. Due dates within 7 days and completedAt IS NULL
  const upcomingDueDates = await db
    .select()
    .from(dueDate)
    .where(
      and(
        inArray(dueDate.representativeId, representativeIds),
        isNull(dueDate.completedAt),
        gte(dueDate.dueDate, now),
        lte(dueDate.dueDate, in7Days)
      )
    );

  for (const dd of upcomingDueDates) {
    maybeAdd(`upcoming_due_date:due_date:${dd.id}`, {
      organizationId: orgId,
      representativeId: dd.representativeId ?? undefined,
      type: 'upcoming_due_date',
      severity: 'medium',
      title: `Vencimiento próximo: ${dd.tax || dd.concept || 'Sin concepto'}`,
      description: dd.period ? `Período ${dd.period}` : undefined,
      sourceEntityType: 'due_date',
      sourceEntityId: dd.id,
      dueAt: dd.dueDate,
      status: 'open',
    });
  }

  if (alertsToInsert.length === 0) return { created: 0 };

  await db.insert(alert).values(alertsToInsert);

  return { created: alertsToInsert.length };
}
