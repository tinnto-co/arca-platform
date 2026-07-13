import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { client, representative } from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and } from 'drizzle-orm';

export const getClient = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Get client with representative information
    const [clientData] = await db
      .select({
        id: client.id,
        representativeId: client.representativeId,
        name: client.name,
        identityNumber: client.identityNumber,
        identityType: client.identityType,
        address: client.address,
        phone: client.phone,
        email: client.email,
        status: client.status,
        actividadPrincipal: client.actividadPrincipal,
        fechaInscripcion: client.fechaInscripcion,
        numeroInscripcion: client.numeroInscripcion,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      })
      .from(client)
      .where(eq(client.id, ctx.data.id))
      .limit(1);

    if (!clientData) throw new Error('Perfil no encontrado');

    // Verify the representative belongs to the user
    if (clientData.representativeId) {
      const [representativeData] = await db
        .select()
        .from(representative)
        .where(eq(representative.id, clientData.representativeId))
        .limit(1);

      if (!representativeData || representativeData.organizationId !== orgId) {
        throw new Error('No autorizado');
      }
    }

    return clientData;
  });

export const updateClientManagement = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      managedByStudy: z.boolean(),
      disabledReason: z.string().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Verify client belongs to org via representative
    const [clientData] = await db
      .select({ id: client.id, representativeId: client.representativeId })
      .from(client)
      .where(eq(client.id, ctx.data.clientId))
      .limit(1);

    if (!clientData) throw new Error('Perfil no encontrado');

    if (clientData.representativeId) {
      const [representativeData] = await db
        .select({ id: representative.id })
        .from(representative)
        .where(
          and(
            eq(representative.id, clientData.representativeId),
            eq(representative.organizationId, orgId)
          )
        )
        .limit(1);
      if (!representativeData) throw new Error('No autorizado');
    }

    const now = new Date();
    await db
      .update(client)
      .set({
        managedByStudy: ctx.data.managedByStudy,
        disabledAt: ctx.data.managedByStudy ? null : now,
        disabledReason: ctx.data.managedByStudy
          ? null
          : (ctx.data.disabledReason ?? null),
      })
      .where(eq(client.id, ctx.data.clientId));

    return { success: true };
  });

export const updateClientLiquidaSueldos = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ clientId: z.string(), liquidaSueldos: z.boolean() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Verificar que el cliente pertenece a un representante de la organizacion
    const [clientData] = await db
      .select({ id: client.id, representativeId: client.representativeId })
      .from(client)
      .where(eq(client.id, ctx.data.clientId))
      .limit(1);

    if (!clientData) throw new Error('Perfil no encontrado');

    const [representativeData] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(and(eq(representative.id, clientData.representativeId!), eq(representative.organizationId, orgId)))
      .limit(1);

    if (!representativeData) throw new Error('No autorizado');

    await db
      .update(client)
      .set({ liquidaSueldos: ctx.data.liquidaSueldos, updatedAt: new Date() })
      .where(eq(client.id, ctx.data.clientId));

    return { success: true };
  });
