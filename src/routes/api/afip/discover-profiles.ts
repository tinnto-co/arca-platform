/**
 * Proxy SSE hacia el discovery de perfiles del scrapper.
 *
 * Existe para dos cosas:
 *  - La clave fiscal desencriptada nunca sale del server (se acepta `credencialId`).
 *  - El stream de eventos `progress` llega al browser tal cual; un server function
 *    devolvería recién al final, con la UI muerta mientras tanto.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { setDbContext } from '@/lib/db-context';
import { credencialAfip } from '@/drizzle/schema';
import { safeDecrypt } from '@/lib/crypto';

const SCRAPPER_URL =
  process.env.SCRAPPER_JOBS_URL ??
  process.env.BACKEND_API_URL ??
  'http://localhost:3002';

const bodySchema = z.union([
  z.object({ credencialId: z.string().uuid() }),
  z.object({ cuit: z.string().min(1), password: z.string().min(1) }),
]);

export const Route = createFileRoute('/api/afip/discover-profiles')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id)
          return new Response('Unauthorized', { status: 401 });
        const orgId = (session.session as { activeOrganizationId?: string })
          .activeOrganizationId;
        if (!orgId)
          return new Response('No active organization', { status: 403 });
        setDbContext({ orgId });

        const parsed = bodySchema.safeParse(
          await request.json().catch(() => null)
        );
        if (!parsed.success)
          return Response.json(
            { error: 'Se requiere credencialId, o cuit + password' },
            { status: 400 }
          );

        let cuit: string;
        let password: string;

        if ('credencialId' in parsed.data) {
          const [cred] = await db
            .select({
              cuit: credencialAfip.cuit,
              clave: credencialAfip.clave,
            })
            .from(credencialAfip)
            .where(
              and(
                eq(credencialAfip.id, parsed.data.credencialId),
                eq(credencialAfip.orgId, orgId)
              )
            )
            .limit(1);
          if (!cred)
            return Response.json(
              { error: 'Credencial no encontrada' },
              { status: 404 }
            );
          cuit = cred.cuit;
          password = safeDecrypt(cred.clave);
        } else {
          cuit = parsed.data.cuit;
          password = parsed.data.password;
        }

        const upstream = await fetch(`${SCRAPPER_URL}/api/discovery/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cuit, password }),
        });

        if (!upstream.body) {
          const text = await upstream.text().catch(() => '');
          return Response.json(
            { error: text || 'El scrapper no devolvió respuesta' },
            { status: upstream.status || 502 }
          );
        }

        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            'Content-Type':
              upstream.headers.get('content-type') ?? 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      },
    },
  },
});
