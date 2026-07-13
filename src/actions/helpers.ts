import { auth } from '@/lib/auth';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { db } from '@/lib/db';
import { member } from '@/drizzle/auth';
import {
  representative,
  representativeUserAccess,
  organizationModule,
} from '@/drizzle/schema';
import { and, eq } from 'drizzle-orm';

export async function getAuthSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session;
}

export async function getActiveOrganizationId(): Promise<string> {
  const session = await getAuthSession();
  const orgId = (session.session as { activeOrganizationId?: string })
    .activeOrganizationId;
  if (!orgId) throw new Error('No active organization');
  return orgId;
}

export async function getSessionWithOrg() {
  const session = await getAuthSession();
  const orgId = (session.session as { activeOrganizationId?: string })
    .activeOrganizationId;
  if (!orgId) throw new Error('No active organization');
  return { session, orgId, userId: session.user.id };
}

export async function getMemberRole(): Promise<string> {
  const session = await getAuthSession();
  const orgId = (session.session as { activeOrganizationId?: string })
    .activeOrganizationId;
  if (!orgId) return 'viewer';

  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, session.user.id), eq(member.organizationId, orgId))
    )
    .limit(1);

  return m?.role ?? 'viewer';
}

export function assertCanWrite(role: string) {
  if (role === 'viewer') {
    throw new Error('No tienes permisos para realizar esta acción');
  }
}

export async function getOrgRepresentativeIds(
  orgId: string
): Promise<string[]> {
  const representatives = await db
    .select({ id: representative.id })
    .from(representative)
    .where(eq(representative.organizationId, orgId));
  return representatives.map((c) => c.id);
}

/**
 * Returns auth session + the first representativeUserAccess row for the calling user.
 * Used by client portal routes to validate access and resolve the representativeId.
 * Throws if the user has no representativeUserAccess rows.
 */
export async function getRepresentativePortalSession() {
  const session = await getAuthSession();
  const userId = session.user.id;

  const [access] = await db
    .select()
    .from(representativeUserAccess)
    .where(eq(representativeUserAccess.userId, userId))
    .limit(1);

  if (!access) {
    throw new Error('Sin acceso al portal del cliente');
  }

  return { session, userId, representativeId: access.representativeId, access };
}

/**
 * Returns true if the given module is enabled for the organization.
 * Modules: sueldos, banco, contabilidad, analytics, portal_cliente, ai_agent
 */
export async function isModuleEnabled(
  orgId: string,
  module: string
): Promise<boolean> {
  const [row] = await db
    .select({ enabled: organizationModule.enabled })
    .from(organizationModule)
    .where(
      and(
        eq(organizationModule.organizationId, orgId),
        eq(organizationModule.module, module)
      )
    )
    .limit(1);

  return row?.enabled ?? false;
}
