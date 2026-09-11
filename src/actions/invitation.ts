import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { invitation, organization } from '@/drizzle/auth';
import { and, eq, gt } from 'drizzle-orm';

export interface PublicInvitationPreview {
  id: string;
  email: string;
  /** Cargado por quien invitó; puede no estar en invitaciones viejas. */
  nombre: string | null;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  expiresAt: Date;
}

/**
 * Lectura pública por id (solo pending y no vencida) para la página /invite/:id.
 * Better Auth `organization.getInvitation` exige sesión y email del destinatario;
 * sin esto, un usuario anónimo no puede cargar la invitación.
 */
export const getPublicInvitationPreview = createServerFn({
  method: 'GET',
})
  .validator(
    z.object({
      invitationId: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    const { invitationId } = ctx.data;
    const now = new Date();

    const rows = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        // Lo cargó quien invitó: la pantalla de alta lo usa para no volver a
        // pedírselo a quien ya fue nombrado.
        nombre: invitation.nombre,
        role: invitation.role,
        organizationId: invitation.organizationId,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .innerJoin(organization, eq(invitation.organizationId, organization.id))
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.status, 'pending'),
          gt(invitation.expiresAt, now)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      nombre: row.nombre,
      role: row.role ?? 'member',
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationSlug: row.organizationSlug,
      expiresAt: row.expiresAt,
    } satisfies PublicInvitationPreview;
  });
