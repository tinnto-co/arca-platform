/**
 * Lectura del logo de la organización, streameado desde el bucket privado.
 *
 * GET /api/org/logo/{orgId}.{ext} — cualquier usuario con sesión en esa org.
 */
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import * as r2 from '@/lib/r2';

const EXT_A_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export const Route = createFileRoute('/api/org/logo/$file')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id)
          return new Response('Unauthorized', { status: 401 });

        const match = /^(.+)\.([a-z0-9]{1,5})$/.exec(params.file);
        const mime = match ? EXT_A_MIME[match[2]] : undefined;
        if (!match || !mime) return new Response('Not found', { status: 404 });
        const [, orgId] = match;

        // El logo es de la organización activa: nadie ve el de otro estudio.
        const activa = (session.session as { activeOrganizationId?: string })
          .activeOrganizationId;
        if (activa !== orgId) return new Response('Forbidden', { status: 403 });

        let buffer: Buffer;
        try {
          buffer = await r2.download(r2.logoOrgKey(orgId, match[2]));
        } catch (error) {
          console.error('[org-logo] falló la lectura de R2', { orgId, error });
          return new Response('Not found', { status: 404 });
        }

        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': mime,
            // La URL cambia con ?v= en cada subida: se puede cachear fuerte.
            'Cache-Control': 'private, max-age=86400',
          },
        });
      },
    },
  },
});
