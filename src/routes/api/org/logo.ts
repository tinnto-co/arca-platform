/**
 * Subida del logo de la organización. El bucket de R2 es privado: acá se
 * recibe el archivo (multipart), se guarda como logos/{orgId}.{ext} y en
 * organization.logo queda la ruta del endpoint de lectura (con ?v= para
 * bustear caché), nunca una URL firmada que vence ni base64 en la DB.
 *
 * POST /api/org/logo  (form-data: file) — solo el owner de la org activa.
 */
import { createFileRoute } from '@tanstack/react-router';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { member } from '@/drizzle/auth';
import * as r2 from '@/lib/r2';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Formatos que un logo puede tener. SVG queda afuera: puede llevar scripts. */
const MIME_A_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const Route = createFileRoute('/api/org/logo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id)
          return new Response('Unauthorized', { status: 401 });
        const orgId = (session.session as { activeOrganizationId?: string })
          .activeOrganizationId;
        if (!orgId) return new Response('Forbidden', { status: 403 });

        const [m] = await db
          .select({ role: member.role })
          .from(member)
          .where(
            and(
              eq(member.userId, session.user.id),
              eq(member.organizationId, orgId)
            )
          )
          .limit(1);
        if (m?.role !== 'owner')
          return Response.json(
            { error: 'Solo el administrador puede cambiar el logo' },
            { status: 403 }
          );

        let file: File | null = null;
        try {
          const form = await request.formData();
          const f = form.get('file');
          if (f instanceof File) file = f;
        } catch {
          // multipart inválido: cae al 400 de abajo
        }
        if (!file)
          return Response.json({ error: 'Falta el archivo' }, { status: 400 });

        const ext = MIME_A_EXT[file.type];
        if (!ext)
          return Response.json(
            { error: 'El logo tiene que ser PNG, JPG o WebP' },
            { status: 400 }
          );
        if (file.size > MAX_BYTES)
          return Response.json(
            { error: 'El logo no puede pesar más de 2 MB' },
            { status: 400 }
          );

        const buffer = new Uint8Array(await file.arrayBuffer());
        const key = r2.logoOrgKey(orgId, ext);
        try {
          await r2.upload(key, buffer, file.type);
          // Si antes había un logo con otra extensión, que no quede huérfano.
          for (const otraExt of Object.values(MIME_A_EXT)) {
            if (otraExt !== ext) {
              await r2
                .remove(r2.logoOrgKey(orgId, otraExt))
                .catch(() => undefined);
            }
          }
        } catch (error) {
          console.error('[org-logo] falló la subida a R2', { orgId, error });
          return Response.json(
            { error: 'No se pudo guardar el logo. Reintentá en unos minutos.' },
            { status: 502 }
          );
        }

        // La URL guardada es relativa y estable; ?v= bustea la caché al cambiar.
        const logoUrl = `/api/org/logo/${orgId}.${ext}?v=${Date.now()}`;
        await auth.api.updateOrganization({
          headers: request.headers,
          body: { data: { logo: logoUrl } },
        });

        return Response.json({ logo: logoUrl });
      },
    },
  },
});
