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
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { member, organization } from '@/drizzle/auth';
import { superadminAcceso } from '@/drizzle/schema';
import { ROL_SOPORTE } from '@/lib/permissions';

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
        // La columna de la tabla externa va calificada a mano. Drizzle
        // interpola `${organization.id}` como `"id"` a secas, y adentro del
        // subquery ese `"id"` resuelve contra `member m` —que también tiene
        // una columna `id`—: la condición pasaba a comparar el id de la
        // membresía consigo mismo y no coincidía nunca. De ahí el "0
        // miembros" en todos los estudios.
        // Los accesos de soporte no son miembros del estudio: no los cuenta
        // acá ni los ve el estudio en su propia pantalla de administración.
        miembros: sql<number>`(
          select count(*)::int from ${member} m
          where m.organization_id = "organization"."id"
            and m.role <> ${ROL_SOPORTE}
        )`,
        esPropia: sql<boolean>`exists (
          select 1 from ${member} m
          where m.organization_id = "organization"."id"
            and m.user_id = ${userId}
            and m.role <> ${ROL_SOPORTE}
        )`,
        accesoAbierto: sql<boolean>`exists (
          select 1 from ${member} m
          where m.organization_id = "organization"."id"
            and m.user_id = ${userId}
            and m.role = ${ROL_SOPORTE}
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
/**
 * Entra a un estudio como soporte.
 *
 * No lo hace miembro: la fila que se inserta en `member` lleva el rol
 * `superadmin`, que el estudio no ve en su lista ni cuenta en su total, y que
 * se borra al salir. Existe porque Better Auth exige membresía antes de fijar
 * la organización activa, y la sesión vive en una cookie firmada que sólo su
 * endpoint sabe refrescar —escribir la fila de sesión a mano no tendría efecto
 * hasta que venza el `cookieCache`, que son 24 horas—.
 *
 * Cada entrada queda anotada en `superadmin_acceso`, que sobrevive a la salida:
 * la fila de `member` dice si hay un acceso abierto ahora, la bitácora dice
 * quién entró a qué estudio y cuándo.
 */
export const entrarOrganizacion = createServerFn({ method: 'POST' })
  .validator(z.object({ organizationId: z.string().min(1) }))
  .handler(async (ctx) => {
    const { userId } = await requireSuperadmin();
    const { organizationId } = ctx.data;

    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!org) throw new Error('Organización no encontrada');

    const [membresia] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, organizationId))
      )
      .limit(1);

    // Si es un estudio propio, entrar es simplemente cambiar de organización:
    // no hay soporte que registrar ni membresía que fabricar.
    const esPropia = !!membresia && membresia.role !== ROL_SOPORTE;

    if (!membresia) {
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role: ROL_SOPORTE,
      });
    }

    if (!esPropia) {
      const [abierto] = await db
        .select({ id: superadminAcceso.id })
        .from(superadminAcceso)
        .where(
          and(
            eq(superadminAcceso.userId, userId),
            eq(superadminAcceso.organizationId, organizationId),
            isNull(superadminAcceso.salioAt)
          )
        )
        .limit(1);
      if (!abierto) {
        await db
          .insert(superadminAcceso)
          .values({ userId, organizationId });
      }
    }

    await auth.api.setActiveOrganization({
      headers: getRequestHeaders(),
      body: { organizationId },
    });

    return { success: true, soporte: !esPropia };
  });

/**
 * Cierra el acceso de soporte: borra la membresía marcada, cierra la anotación
 * de la bitácora y devuelve la sesión a un estudio propio (o a ninguno, que es
 * el estado normal de un superadmin que no tiene estudio).
 *
 * Sobre un estudio propio no hace nada: no hay acceso de soporte que cerrar.
 */
export const salirOrganizacion = createServerFn({ method: 'POST' })
  .validator(z.object({ organizationId: z.string().min(1) }))
  .handler(async (ctx) => {
    const { userId } = await requireSuperadmin();
    const { organizationId } = ctx.data;

    const borradas = await db
      .delete(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId),
          eq(member.role, ROL_SOPORTE)
        )
      )
      .returning({ id: member.id });

    if (borradas.length === 0) {
      throw new Error('No hay un acceso de soporte abierto en este estudio');
    }

    await db
      .update(superadminAcceso)
      .set({ salioAt: new Date() })
      .where(
        and(
          eq(superadminAcceso.userId, userId),
          eq(superadminAcceso.organizationId, organizationId),
          isNull(superadminAcceso.salioAt)
        )
      );

    // La sesión no puede quedar apuntando a un estudio del que ya no es
    // miembro: Better Auth la limpiaría sola en la próxima llamada, pero
    // dejarla así deja la app en un estado raro hasta que eso pase.
    const [propia] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, userId), ne(member.role, ROL_SOPORTE)))
      .limit(1);

    await auth.api.setActiveOrganization({
      headers: getRequestHeaders(),
      body: { organizationId: propia?.organizationId ?? null },
    });

    return { success: true };
  });

/** La bitácora, para responder quién entró a qué estudio y cuándo. */
export const listAccesosSoporte = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireSuperadmin();
    return await db
      .select({
        id: superadminAcceso.id,
        organizationId: superadminAcceso.organizationId,
        organizacion: organization.name,
        entroAt: superadminAcceso.entroAt,
        salioAt: superadminAcceso.salioAt,
      })
      .from(superadminAcceso)
      .innerJoin(
        organization,
        eq(organization.id, superadminAcceso.organizationId)
      )
      .orderBy(sql`${superadminAcceso.entroAt} desc`)
      .limit(200);
  }
);
