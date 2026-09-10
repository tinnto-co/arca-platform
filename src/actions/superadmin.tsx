/**
 * Gestión de organizaciones para el superadmin (user.role === 'admin', del
 * plugin `admin` de Better Auth — un rol de USUARIO, por encima de los roles
 * por organización owner/member/viewer).
 *
 * El superadmin es quien da de alta estudios contables como clientes del
 * producto. «Entrar a esta cuenta» lo agrega como owner de esa organización
 * (membresía visible y auditada en la tabla member — no hay acceso invisible)
 * y la activa en su sesión.
 */
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { member, organization } from '@/drizzle/auth';

async function requireSuperadmin() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error('Unauthorized');
  const role = (session.user as { role?: string | null }).role;
  if (role !== 'admin') {
    throw new Error('Solo el superadmin puede gestionar organizaciones');
  }
  return { session, userId: session.user.id };
}

/** Todas las organizaciones, con miembros y si el superadmin ya pertenece. */
export const listOrganizaciones = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { userId } = await requireSuperadmin();

    return await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        miembros: sql<number>`(
          select count(*)::int from ${member} m
          where m.organization_id = ${organization.id}
        )`,
        yaEsMiembro: sql<boolean>`exists (
          select 1 from ${member} m
          where m.organization_id = ${organization.id}
            and m.user_id = ${userId}
        )`,
      })
      .from(organization)
      .orderBy(organization.createdAt);
  }
);

/**
 * Crea una organización vía Better Auth (org + creador como owner, atómico).
 * El slug identifica al estudio en URLs e invitaciones: minúsculas y guiones.
 */
export const crearOrganizacion = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(2, 'El nombre es muy corto'),
      slug: z
        .string()
        .trim()
        .regex(
          /^[a-z0-9]+(-[a-z0-9]+)*$/,
          'El identificador va en minúsculas, números y guiones (ej. estudio-perez)'
        ),
    })
  )
  .handler(async (ctx) => {
    await requireSuperadmin();

    const [existente] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, ctx.data.slug))
      .limit(1);
    if (existente)
      throw new Error('Ya existe una organización con ese identificador');

    const creada = await auth.api.createOrganization({
      headers: getRequestHeaders(),
      body: { name: ctx.data.name, slug: ctx.data.slug },
    });
    if (!creada) throw new Error('No se pudo crear la organización');

    return { id: creada.id, name: creada.name, slug: creada.slug };
  });

/**
 * Entra a una organización: asegura la membresía como owner (visible en la
 * lista de miembros de ese estudio) y la deja activa en la sesión.
 */
export const entrarOrganizacion = createServerFn({ method: 'POST' })
  .validator(z.object({ organizationId: z.string().min(1) }))
  .handler(async (ctx) => {
    const { userId } = await requireSuperadmin();

    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, ctx.data.organizationId))
      .limit(1);
    if (!org) throw new Error('Organización no encontrada');

    const [membresia] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, ctx.data.organizationId)
        )
      )
      .limit(1);

    if (!membresia) {
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: ctx.data.organizationId,
        userId,
        role: 'owner',
      });
    }

    await auth.api.setActiveOrganization({
      headers: getRequestHeaders(),
      body: { organizationId: ctx.data.organizationId },
    });

    return { success: true };
  });
