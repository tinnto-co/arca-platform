import { db } from '@/lib/db';
import {
  alert,
  client,
  debt,
  notification,
  dueDate,
} from '@/drizzle/schema';
import { and, eq, lt, isNull, gte, lte, inArray } from 'drizzle-orm';

/**
 * Generates alerts for an organization by scanning:
 * - Overdue open debts (dueDate < now)
 * - Critical unresolved notifications
 * - Due dates within the next 7 days (not completed)
 * - Clients with scraper errors
 *
 * Deduplicates by (type, sourceEntityType, sourceEntityId) on open alerts.
 */
export async function generateAlerts(orgId: string): Promise<{ created: number }> {
  const orgClients = await db
    .select({ id: client.id, name: client.name, errorMessage: client.errorMessage })
    .from(client)
    .where(eq(client.organizationId, orgId));

  if (orgClients.length === 0) return { created: 0 };

  const clientIds = orgClients.map((c) => c.id);

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
    existingAlerts.map((a) => `${a.type}:${a.sourceEntityType}:${a.sourceEntityId}`)
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
    .where(and(inArray(debt.client, clientIds), eq(debt.status, 'open'), lt(debt.dueDate, now)));

  for (const d of overdueDebts) {
    maybeAdd(`overdue_debt:debt:${d.id}`, {
      organizationId: orgId,
      clientId: d.client ?? undefined,
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
        inArray(notification.client, clientIds),
        eq(notification.severity, 'critical'),
        isNull(notification.resolvedAt)
      )
    );

  for (const n of criticalNotifs) {
    const summary = n.aiSummary ?? n.message.slice(0, 80);
    maybeAdd(`critical_notification:notification:${n.id}`, {
      organizationId: orgId,
      clientId: n.client ?? undefined,
      profileId: n.profile ?? undefined,
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
        inArray(dueDate.client, clientIds),
        isNull(dueDate.completedAt),
        gte(dueDate.dueDate, now),
        lte(dueDate.dueDate, in7Days)
      )
    );

  for (const dd of upcomingDueDates) {
    maybeAdd(`upcoming_due_date:due_date:${dd.id}`, {
      organizationId: orgId,
      clientId: dd.client ?? undefined,
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

  // 4. Clients with scraper errors
  const errorClients = await db
    .select()
    .from(client)
    .where(and(eq(client.organizationId, orgId), eq(client.hasErrors, true)));

  for (const c of errorClients) {
    maybeAdd(`scraper_error:client:${c.id}`, {
      organizationId: orgId,
      clientId: c.id,
      type: 'scraper_error',
      severity: 'high',
      title: `Error en scraper: ${c.name}`,
      description: c.errorMessage || undefined,
      sourceEntityType: 'client',
      sourceEntityId: c.id,
      status: 'open',
    });
  }

  if (alertsToInsert.length === 0) return { created: 0 };

  await db.insert(alert).values(alertsToInsert);

  return { created: alertsToInsert.length };
}
