import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usuarioTutorial } from '@/drizzle/schema';
import { getSessionWithOrg } from './helpers';

/** Tutoriales que existen. Un id nuevo se abre solo para todos la primera vez. */
const tutorialId = z.enum(['reglas-mapeo']);

/**
 * Si el usuario ya terminó u omitió el tutorial. `null` = nunca lo vio, y el
 * tutorial se abre solo.
 */
export const getTutorialState = createServerFn({ method: 'GET' })
  .validator(z.object({ tutorial: tutorialId }))
  .handler(async ({ data }) => {
    const { userId } = await getSessionWithOrg();
    const [row] = await db
      .select({ estado: usuarioTutorial.estado })
      .from(usuarioTutorial)
      .where(
        and(
          eq(usuarioTutorial.userId, userId),
          eq(usuarioTutorial.tutorial, data.tutorial)
        )
      )
      .limit(1);
    return { estado: row?.estado ?? null };
  });

export const setTutorialState = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      tutorial: tutorialId,
      estado: z.enum(['completado', 'omitido']),
    })
  )
  .handler(async ({ data }) => {
    const { userId } = await getSessionWithOrg();
    await db
      .insert(usuarioTutorial)
      .values({ userId, tutorial: data.tutorial, estado: data.estado })
      .onConflictDoUpdate({
        target: [usuarioTutorial.userId, usuarioTutorial.tutorial],
        set: { estado: data.estado, updatedAt: new Date() },
      });
    return { ok: true };
  });
