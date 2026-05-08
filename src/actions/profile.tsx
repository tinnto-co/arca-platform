import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { profile, client } from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and } from 'drizzle-orm';

export const getProfile = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Get profile with client information
    const [profileData] = await db
      .select({
        id: profile.id,
        clientId: profile.client,
        name: profile.name,
        identityNumber: profile.identityNumber,
        identityType: profile.identityType,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        status: profile.status,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })
      .from(profile)
      .where(eq(profile.id, ctx.data.id))
      .limit(1);

    if (!profileData) throw new Error('Perfil no encontrado');

    // Verify the client belongs to the user
    if (profileData.clientId) {
      const [clientData] = await db
        .select()
        .from(client)
        .where(eq(client.id, profileData.clientId))
        .limit(1);

      if (!clientData || clientData.organizationId !== orgId) {
        throw new Error('No autorizado');
      }
    }

    return profileData;
  });

export const updateProfileManagement = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      profileId: z.string().uuid(),
      managedByStudy: z.boolean(),
      disabledReason: z.string().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Verify profile belongs to org via client
    const [profileData] = await db
      .select({ id: profile.id, clientId: profile.client })
      .from(profile)
      .where(eq(profile.id, ctx.data.profileId))
      .limit(1);

    if (!profileData) throw new Error('Perfil no encontrado');

    if (profileData.clientId) {
      const [clientData] = await db
        .select({ id: client.id })
        .from(client)
        .where(
          and(
            eq(client.id, profileData.clientId),
            eq(client.organizationId, orgId)
          )
        )
        .limit(1);
      if (!clientData) throw new Error('No autorizado');
    }

    const now = new Date();
    await db
      .update(profile)
      .set({
        managedByStudy: ctx.data.managedByStudy,
        disabledAt: ctx.data.managedByStudy ? null : now,
        disabledReason: ctx.data.managedByStudy
          ? null
          : (ctx.data.disabledReason ?? null),
      })
      .where(eq(profile.id, ctx.data.profileId));

    return { success: true };
  });

export const updateProfileLiquidaSueldos = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ profileId: z.string(), liquidaSueldos: z.boolean() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Verificar que el perfil pertenece a un cliente de la organización
    const [profileData] = await db
      .select({ id: profile.id, clientId: profile.client })
      .from(profile)
      .where(eq(profile.id, ctx.data.profileId))
      .limit(1);

    if (!profileData) throw new Error('Perfil no encontrado');

    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(and(eq(client.id, profileData.clientId!), eq(client.organizationId, orgId)))
      .limit(1);

    if (!clientData) throw new Error('No autorizado');

    await db
      .update(profile)
      .set({ liquidaSueldos: ctx.data.liquidaSueldos, updatedAt: new Date() })
      .where(eq(profile.id, ctx.data.profileId));

    return { success: true };
  });
