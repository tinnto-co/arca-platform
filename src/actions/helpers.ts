import { auth } from '@/lib/auth';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { db, withUserContext } from '@/lib/db';
import { member } from '@/drizzle/auth';
import {
  credencialAfip,
  accesoUsuarioCliente,
  organizationModule,
  type orgModule,
} from '@/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { setDbContext } from '@/lib/db-context';

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
  setDbContext({ orgId });
  return orgId;
}

export async function getSessionWithOrg() {
  const session = await getAuthSession();
  const orgId = (session.session as { activeOrganizationId?: string })
    .activeOrganizationId;
  if (!orgId) throw new Error('No active organization');
  // Habilita el RLS para el resto del handler: sin esto las queries salen por
  // el pool sin `app.org_id` y Postgres no devuelve ninguna fila.
  setDbContext({ orgId });
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

/** Los logins de AFIP de la organización. */
export async function getOrgCredencialIds(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ id: credencialAfip.id })
    .from(credencialAfip)
    .where(eq(credencialAfip.orgId, orgId));
  return rows.map((c) => c.id);
}

/**
 * Sesión + el primer acceso del usuario al portal. El acceso es por cliente
 * (entidad fiscal), no por login de AFIP.
 */
export async function getClientePortalSession() {
  const session = await getAuthSession();
  const userId = session.user.id;

  // Huevo y gallina: para saber qué cliente ve este usuario hay que leer una
  // tabla que el RLS filtra por organización, y una sesión de portal no tiene
  // organización activa. Se resuelve con `app.user_id`: el usuario sólo puede
  // ver sus propias filas de acceso.
  const [access] = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(accesoUsuarioCliente)
      .where(eq(accesoUsuarioCliente.userId, userId))
      .limit(1)
  );

  if (!access) {
    throw new Error('Sin acceso al portal del cliente');
  }

  // A partir de acá las queries salen por el rol arca_portal, que sólo ve las
  // filas de este cliente.
  setDbContext({ clienteId: access.clienteId });

  return { session, userId, clienteId: access.clienteId, access };
}

/**
 * Returns true if the given module is enabled for the organization.
 * Modules: sueldos, banco, contabilidad, analytics, portal_cliente, ai_agent
 */
export async function isModuleEnabled(
  orgId: string,
  module: (typeof orgModule.enumValues)[number]
): Promise<boolean> {
  const [row] = await db
    .select({ enabled: organizationModule.enabled })
    .from(organizationModule)
    .where(
      and(
        eq(organizationModule.orgId, orgId),
        eq(organizationModule.module, module)
      )
    )
    .limit(1);

  return row?.enabled ?? false;
}
