/**
 * Descarga de un documento. El bucket de R2 es privado: el archivo se sirve
 * por acá, validando sesión y organización, en vez de exponer una URL pública.
 *
 * GET /api/documents/{documentId}            -> inline (previsualizar)
 * GET /api/documents/{documentId}?download=1 -> attachment (bajar)
 */
import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { setDbContext } from '@/lib/db-context';
import { getClientePortalSession } from '@/actions/helpers';
import { documento } from '@/drizzle/schema';
import * as r2 from '@/lib/r2';

export const Route = createFileRoute('/api/documents/$documentId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id)
          return new Response('Unauthorized', { status: 401 });
        const orgId = (session.session as { activeOrganizationId?: string })
          .activeOrganizationId;
        if (orgId) {
          setDbContext({ orgId });
        } else {
          // Un usuario del portal no pertenece a ninguna organización: abre el
          // contexto de su cliente y el RLS de `arca_portal` acota las filas.
          const portal = await getClientePortalSession().catch(() => null);
          if (!portal) return new Response('Forbidden', { status: 403 });
        }

        const [doc] = await db
          .select({
            nombre: documento.nombre,
            storageKey: documento.storageKey,
            mimeType: documento.mimeType,
          })
          .from(documento)
          .where(
            orgId
              ? and(
                  eq(documento.id, params.documentId),
                  eq(documento.orgId, orgId)
                )
              : eq(documento.id, params.documentId)
          )
          .limit(1);

        if (!doc) return new Response('Not found', { status: 404 });

        if (!doc.storageKey)
          return new Response('Documento sin storage_key', { status: 404 });

        let buffer: Buffer;
        try {
          buffer = await r2.download(doc.storageKey);
        } catch (error) {
          // El detalle del storage queda en el log: al navegador sólo le llega
          // que el archivo no está disponible.
          console.error('[documents] falló la descarga de R2', {
            documentId: params.documentId,
            storageKey: doc.storageKey,
            error,
          });
          return new Response('No se pudo leer el archivo', { status: 502 });
        }

        const disposition = new URL(request.url).searchParams.has('download')
          ? 'attachment'
          : 'inline';
        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': doc.mimeType,
            'Content-Disposition': `${disposition}; filename="${encodeURIComponent(doc.nombre)}"`,
            'Cache-Control': 'private, max-age=300',
          },
        });
      },
    },
  },
});
