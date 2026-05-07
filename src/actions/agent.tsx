import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agentConversation, agentMessage } from '@/drizzle/schema';
import { getSessionWithOrg } from '@/actions/helpers';
import { eq, and, desc, ilike } from 'drizzle-orm';

export const getAgentConversations = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({ limit: z.number().optional(), offset: z.number().optional() })
      .optional()
  )
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    return db
      .select({
        id: agentConversation.id,
        title: agentConversation.title,
        createdAt: agentConversation.createdAt,
        updatedAt: agentConversation.updatedAt,
      })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.organizationId, orgId),
          eq(agentConversation.userId, userId)
        )
      )
      .orderBy(desc(agentConversation.updatedAt))
      .limit(data?.limit ?? 15)
      .offset(data?.offset ?? 0);
  });

export const searchConversations = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    return db
      .select({
        id: agentConversation.id,
        title: agentConversation.title,
        updatedAt: agentConversation.updatedAt,
      })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.organizationId, orgId),
          eq(agentConversation.userId, userId),
          ilike(agentConversation.title, `%${data.query}%`)
        )
      )
      .orderBy(desc(agentConversation.updatedAt))
      .limit(50);
  });

export const getConversationMessages = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const [conv] = await db
      .select({ id: agentConversation.id })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.organizationId, orgId),
          eq(agentConversation.userId, userId)
        )
      )
      .limit(1);
    if (!conv) throw new Error('Conversación no encontrada');
    const rows = await db
      .select({
        id: agentMessage.id,
        conversationId: agentMessage.conversationId,
        role: agentMessage.role,
        content: agentMessage.content,
        metadata: agentMessage.metadata,
        toolCalls: agentMessage.toolCalls,
        citations: agentMessage.citations,
        confidence: agentMessage.confidence,
        createdAt: agentMessage.createdAt,
      })
      .from(agentMessage)
      .where(eq(agentMessage.conversationId, data.conversationId))
      .orderBy(agentMessage.createdAt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any;
  });

export const deleteConversation = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ conversationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const [conv] = await db
      .select({ id: agentConversation.id })
      .from(agentConversation)
      .where(
        and(
          eq(agentConversation.id, data.conversationId),
          eq(agentConversation.organizationId, orgId),
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
