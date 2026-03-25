import { auth } from "@/lib/auth";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@/lib/db";
import { member } from "@/drizzle/auth";
import { client } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";

export async function getAuthSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

export async function getActiveOrganizationId(): Promise<string> {
  const session = await getAuthSession();
  const orgId = (session.session as any).activeOrganizationId;
  if (!orgId) throw new Error("No active organization");
  return orgId;
}

export async function getSessionWithOrg() {
  const session = await getAuthSession();
  const orgId = (session.session as any).activeOrganizationId;
  if (!orgId) throw new Error("No active organization");
  return { session, orgId, userId: session.user.id };
}

export async function getMemberRole(): Promise<string> {
  const session = await getAuthSession();
  const orgId = (session.session as any).activeOrganizationId;
  if (!orgId) return "viewer";

  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, orgId)
      )
    )
    .limit(1);

  return m?.role ?? "viewer";
}

export function assertCanWrite(role: string) {
  if (role === "viewer") {
    throw new Error("No tienes permisos para realizar esta acción");
  }
}

export async function getOrgClientIds(orgId: string): Promise<string[]> {
  const clients = await db
    .select({ id: client.id })
    .from(client)
    .where(eq(client.organizationId, orgId));
  return clients.map((c) => c.id);
}
