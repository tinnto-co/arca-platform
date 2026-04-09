import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { credential } from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and } from 'drizzle-orm';

const arcaCredentialSchema = z.object({
  cuit: z.string().min(1, 'El CUIT es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const createCredential = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      clientId: z.string(),
      provider: z.string().min(1, 'El proveedor es requerido'),
      data: z.object({
        cuit: z.string().min(1, 'El CUIT es requerido'),
        password: z.string().min(1, 'La contraseña es requerida'),
      }),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId, provider, data } = ctx.data;

    // Validate data based on provider
    if (provider === 'arca') {
      arcaCredentialSchema.parse(data);
    }

    const [newCredential] = await db
      .insert(credential)
      .values({
        client: clientId,
        provider,
        data,
      })
      .returning();

    if (!newCredential) throw new Error('Error al crear la credencial');

    return newCredential;
  });

export const getCredentials = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ clientId: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();

    const credentials = await db
      .select()
      .from(credential)
      .where(eq(credential.client, ctx.data.clientId))
      .orderBy(credential.createdAt);

    // Remove sensitive data from response
    return credentials.map((cred) => ({
      ...cred,
      data: {
        ...cred.data,
        password: cred.data.password ? '••••••••' : undefined,
      },
    }));
  });

export const getCredential = createServerFn({
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();

    const [credentialData] = await db
      .select()
      .from(credential)
      .where(eq(credential.id, ctx.data.id))
      .limit(1);

    if (!credentialData) throw new Error('Credencial no encontrada');

    return credentialData;
  });

export const updateCredential = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      provider: z.string().min(1, 'El proveedor es requerido'),
      data: z.record(z.any()),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const { id, provider, data } = ctx.data;

    // Validate data based on provider
    if (provider === 'arca') {
      arcaCredentialSchema.parse(data);
    }

    const [updatedCredential] = await db
      .update(credential)
      .set({
        provider,
        data,
        updatedAt: new Date(),
      })
      .where(eq(credential.id, id))
      .returning();

    if (!updatedCredential)
      throw new Error('Error al actualizar la credencial');

    return updatedCredential;
  });

export const deleteCredential = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [deletedCredential] = await db
      .delete(credential)
      .where(eq(credential.id, ctx.data.id))
      .returning();

    if (!deletedCredential) throw new Error('Error al eliminar la credencial');

    return { success: true };
  });
