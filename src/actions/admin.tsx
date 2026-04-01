import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, user } from "@/drizzle/auth";
import { eq, and } from "drizzle-orm";

async function requireOwner() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const orgId = (session.session as any).activeOrganizationId as string | null;
  if (!orgId) throw new Error("No active organization");

  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, session.user.id), eq(member.organizationId, orgId))
    )
    .limit(1);

  if (!m || m.role !== "owner") {
    throw new Error("Solo el administrador puede realizar esta acción");
  }

  return { session, orgId, userId: session.user.id };
}

export const getOrgMembers = createServerFn({
  method: "GET",
}).handler(async () => {
  const { orgId } = await requireOwner();

  const members = await db
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  return members;
});

export const getOrgDetails = createServerFn({
  method: "GET",
}).handler(async () => {
  const { orgId } = await requireOwner();

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (!org) throw new Error("Organización no encontrada");
  return org;
});

export const updateOrg = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      logo: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await requireOwner();

    await auth.api.updateOrganization({
      headers: getRequestHeaders(),
      body: {
        data: {
          name: ctx.data.name,
          slug: ctx.data.slug,
          logo: ctx.data.logo,
        },
        organizationId: orgId,
      },
    });

    return { success: true };
  });

export const inviteMember = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      email: z.string().email(),
      role: z.enum(["owner", "member", "viewer"]),
    })
  )
  .handler(async (ctx) => {
    await requireOwner();

    const result = await auth.api.createInvitation({
      headers: getRequestHeaders(),
      body: {
        email: ctx.data.email,
        role: ctx.data.role,
      },
    });

    return result;
  });

export const removeMember = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ memberIdOrEmail: z.string() }))
  .handler(async (ctx) => {
    await requireOwner();

    await auth.api.removeMember({
      headers: getRequestHeaders(),
      body: {
        memberIdOrEmail: ctx.data.memberIdOrEmail,
      },
    });

    return { success: true };
  });

export const updateMemberRole = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      memberId: z.string(),
      role: z.enum(["owner", "member", "viewer"]),
    })
  )
  .handler(async (ctx) => {
    await requireOwner();

    await auth.api.updateMemberRole({
      headers: getRequestHeaders(),
      body: {
        memberId: ctx.data.memberId,
        role: ctx.data.role,
      },
    });

    return { success: true };
  });

export const getOrgInvitations = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireOwner();

  const invitations = await auth.api.listInvitations({
    headers: getRequestHeaders(),
    query: {},
  });

  return invitations;
});

export const cancelInvitation = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ invitationId: z.string() }))
  .handler(async (ctx) => {
    await requireOwner();

    await auth.api.cancelInvitation({
      headers: getRequestHeaders(),
      body: { invitationId: ctx.data.invitationId },
    });

    return { success: true };
  });
