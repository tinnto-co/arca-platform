import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agentConversation, agentMessage } from '@/drizzle/schema';
import { getSessionWithOrg } from '@/actions/helpers';
import { eq, and, desc, ilike } from 'drizzle-orm';

export const getAgentConversations = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({ limit: z.number().optional(), offset: z.number().optional() })
      .optional()
  )
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    return db
      .select({
        id: agentConversation.id,
        titulo: agentConversation.titulo,
        etiqueta: agentConversation.etiqueta,
        fijado: agentConversation.fijado,
        compartido: agentConversation.compartido,
        createdAt: agentConversation.createdAt,
        updatedAt: agentConversation.updatedAt,
      })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.orgId, orgId),
          eq(agentConversation.userId, userId)
        )
      )
      // Las fijadas primero: el orden por fecha manda dentro de cada grupo.
      .orderBy(desc(agentConversation.fijado), desc(agentConversation.updatedAt))
      .limit(data?.limit ?? 15)
      .offset(data?.offset ?? 0);
  });

export const searchConversations = createServerFn({ method: 'GET' })
  .validator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    return db
      .select({
        id: agentConversation.id,
        titulo: agentConversation.titulo,
        etiqueta: agentConversation.etiqueta,
        fijado: agentConversation.fijado,
        compartido: agentConversation.compartido,
        createdAt: agentConversation.createdAt,
        updatedAt: agentConversation.updatedAt,
      })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.orgId, orgId),
          eq(agentConversation.userId, userId),
          ilike(agentConversation.titulo, `%${data.query}%`)
        )
      )
      .orderBy(desc(agentConversation.updatedAt))
      .limit(50);
  });

export const getConversationMessages = createServerFn({ method: 'GET' })
  .validator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const [conv] = await db
      .select({
        id: agentConversation.id,
        userId: agentConversation.userId,
        compartido: agentConversation.compartido,
      })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.orgId, orgId)
        )
      )
      .limit(1);
    // Propia, o compartida por alguien del mismo estudio. El filtro por `orgId`
    // de arriba es el que impide que `compartido` abra la puerta hacia afuera.
    if (!conv || (conv.userId !== userId && !conv.compartido)) {
      throw new Error('Conversación no encontrada');
    }
    const rows = await db
      .select({
        id: agentMessage.id,
        conversationId: agentMessage.conversationId,
        role: agentMessage.role,
        contenido: agentMessage.contenido,
        toolCalls: agentMessage.toolCalls,
        citas: agentMessage.citas,
        createdAt: agentMessage.createdAt,
      })
      .from(agentMessage)
      .where(eq(agentMessage.conversationId, data.conversationId))
      .orderBy(agentMessage.createdAt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any;
  });

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const [conv] = await db
      .select({ id: agentConversation.id })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.orgId, orgId),
          eq(agentConversation.userId, userId)
        )
      )
      .limit(1);
    if (!conv) throw new Error('Conversación no encontrada');
    await db
      .delete(agentConversation)
      .where(eq(agentConversation.id, data.conversationId));
    return { success: true };
  });

/**
 * Devuelve la cabecera de una conversación: título, etiqueta y los dos flags.
 * La vista la necesita para pintar el header sin esperar a que resuelva el
 * listado completo, y para saber si ya está fijada o compartida.
 */
export const getConversation = createServerFn({ method: 'GET' })
  .validator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const [conv] = await db
      .select({
        id: agentConversation.id,
        titulo: agentConversation.titulo,
        etiqueta: agentConversation.etiqueta,
        fijado: agentConversation.fijado,
        compartido: agentConversation.compartido,
        userId: agentConversation.userId,
        updatedAt: agentConversation.updatedAt,
      })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.orgId, orgId)
        )
      )
      .limit(1);
    if (!conv) return null;
    // Propia, o de otro del estudio que la compartió: en ese caso es de lectura.
    if (conv.userId !== userId && !conv.compartido) return null;
    return { ...conv, esPropia: conv.userId === userId };
  });

/** Ancla o desancla una conversación en el listado. */
export const toggleConversationFijado = createServerFn({ method: 'POST' })
  .validator(
    z.object({ conversationId: z.string().uuid(), fijado: z.boolean() })
  )
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const actualizadas = await db
      .update(agentConversation)
      .set({ fijado: data.fijado })
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.orgId, orgId),
          eq(agentConversation.userId, userId)
        )
      )
      .returning({ id: agentConversation.id });
    if (actualizadas.length === 0) {
      throw new Error('Conversación no encontrada');
    }
    return { fijado: data.fijado };
  });

/**
 * Abre o cierra la conversación al resto del estudio.
 *
 * Compartir NO la saca de la organización: sigue filtrada por `org_id`, y lo
 * único que cambia es que otros miembros de esa misma org pueden leerla. Nadie
 * de afuera, y nadie puede escribir en ella —eso lo garantiza `getConversation`,
 * que sólo devuelve `esPropia: true` al dueño—.
 */
export const setConversationCompartido = createServerFn({ method: 'POST' })
  .validator(
    z.object({ conversationId: z.string().uuid(), compartido: z.boolean() })
  )
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const actualizadas = await db
      .update(agentConversation)
      .set({ compartido: data.compartido })
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.orgId, orgId),
          eq(agentConversation.userId, userId)
        )
      )
      .returning({ id: agentConversation.id });
    if (actualizadas.length === 0) {
      throw new Error('Conversación no encontrada');
    }
    return { compartido: data.compartido };
  });
