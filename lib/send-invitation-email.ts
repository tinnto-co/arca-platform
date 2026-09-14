/**
 * Envío de invitaciones a organización (Better Auth organization plugin).
 *
 * Resend: https://resend.com — API key en RESEND_API_KEY.
 *
 * RESEND_FROM debe usar un remitente permitido por Resend:
 * - Producción: dominio verificado en Resend (ej. ARCA <noreply@tinnto.co>).
 * - Prueba sin dominio: RESEND_FROM="onboarding@resend.dev"
 *   (solo podés enviar al email con el que te registraste en Resend).
 *
 * URL del link del mail: BETTER_AUTH_URL (ej. https://blakg.tinnto.co).
 *
 * Sin RESEND_* no se envía mail; la invitación igual queda en la BD y el link en consola.
 */
interface InvitationEmailPayload {
  id: string;
  role: string;
  email: string;
  organization: { id: string; name: string; slug?: string | null };
  inviter: {
    user: { name: string; email: string | null };
  };
}

/**
 * Si hay con qué mandar correo. Lo consulta también quien crea la invitación,
 * para no decirle al usuario "enviada" cuando en realidad no salió nada.
 */
export function hayCorreoConfigurado(): boolean {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;
  return !!apiKey?.trim() && !!from?.trim();
}

/**
 * El link que abre la invitación, con o sin correo de por medio.
 *
 * `BETTER_AUTH_URL` se usa de las dos formas en la práctica: unos entornos la
 * ponen como la base de la aplicación y otros como la del endpoint de auth
 * —`…/api/auth`—, que es lo que documenta Better Auth. La invitación es una
 * pantalla de la aplicación, no del endpoint, así que ese sufijo se saca: con
 * él, el link llegaba como `/api/auth/invite/…` y daba 404.
 */
export function linkDeInvitacion(invitationId: string): string {
  const base =
    process.env.BETTER_AUTH_URL ||
    process.env.PUBLIC_APP_URL ||
    'http://localhost:3000';
  const raiz = base
    .replace(/\/+$/, '')
    .replace(/\/api\/auth$/, '');
  return `${raiz}/invite/${invitationId}`;
}

export async function sendOrganizationInvitationEmail(
  data: InvitationEmailPayload
): Promise<void> {
  const inviteLink = linkDeInvitacion(data.id);
  const base = inviteLink.slice(0, inviteLink.indexOf('/invite/'));

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;

  if (!hayCorreoConfigurado()) {
    console.warn(
      '[invitation] No hay RESEND_API_KEY o RESEND_FROM/EMAIL_FROM. No se envió email. Link para el invitado:',
      inviteLink
    );
    return;
  }

  const inviterName = data.inviter.user.name || 'Un administrador';
  const inviterEmail = data.inviter.user.email || '';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from!.trim(),
      to: [data.email],
      subject: `${inviterName} te invitó a ${data.organization.name} en Orddo`,
      html: invitacionHtml({
        inviteLink,
        inviterName,
        inviterEmail,
        organizacion: data.organization.name,
        rol: ROLES[data.role] ?? data.role,
        base,
      }),
      text: invitacionTexto({
        inviteLink,
        inviterName,
        organizacion: data.organization.name,
        rol: ROLES[data.role] ?? data.role,
      }),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[invitation] Resend error:', res.status, body);
    let hint = '';
    if (res.status === 403) {
      try {
        const j = JSON.parse(body) as { message?: string };
        if (j.message?.includes('not verified')) {
          hint =
            ' Verificá el dominio en https://resend.com/domains o usá RESEND_FROM=onboarding@resend.dev para pruebas.';
        }
      } catch {
        /* ignore */
      }
    }
    throw new Error(
      `No se pudo enviar el email de invitación (${res.status}).${hint}`
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────────────────────────────────
   Plantilla del correo

   Las reglas del correo no son las de la web: Outlook sigue maquetando con
   tablas, Gmail borra el <style> del <head>, y ningún cliente entiende las
   variables CSS del design system. Así que todo va en tablas, con los colores
   escritos a mano —los mismos valores de `app.css`— y sin una sola clase.

   El logo va como imagen y además como texto: la mayoría de los clientes
   bloquean las imágenes hasta que el destinatario las habilita, y el correo
   tiene que leerse igual con los cuadros vacíos.
   ───────────────────────────────────────────────────────────────────────── */

/** Los roles del sistema, en el idioma de quien recibe el correo. */
const ROLES: Record<string, string> = {
  owner: 'Administrador',
  member: 'Miembro',
  viewer: 'Solo lectura',
};

const INK = '#101720';
const INK_2 = '#3B4552';
const INK_3 = '#6B7683';
const INK_4 = '#9AA3AD';
const BORDE = '#E3E7EA';
const FONDO = '#F4F6F7';
const ACENTO = '#1F7A86';
const TURQUESA = '#7FD1CF';
const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Geist,Roboto,Helvetica,Arial,sans-serif";

interface DatosInvitacion {
  inviteLink: string;
  inviterName: string;
  inviterEmail: string;
  organizacion: string;
  rol: string;
  base: string;
}

export function invitacionHtml(d: DatosInvitacion): string {
  const nombre = escapeHtml(d.inviterName);
  const mail = d.inviterEmail ? escapeHtml(d.inviterEmail) : '';
  const org = escapeHtml(d.organizacion);
  const rol = escapeHtml(d.rol);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Invitación a ${org}</title>
</head>
<body style="margin:0;padding:0;background:${FONDO};">
<!-- Lo que se lee en la bandeja antes de abrir, y el relleno que impide que
     el cliente use la primera línea del cuerpo en su lugar. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${nombre} te invitó a ${org} en Orddo. El link vence en 48 horas.
  &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FONDO};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;">

        <!-- Marca -->
        <tr>
          <td style="padding:0 4px 20px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <img src="${d.base}/brand/apple-touch-icon.png" width="32" height="32" alt=""
                       style="display:block;width:32px;height:32px;border:0;border-radius:8px;">
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-family:${FUENTE};font-size:19px;font-weight:700;letter-spacing:-0.4px;color:${INK};line-height:1.1;">Orddo</div>
                  <div style="font-family:${FUENTE};font-size:9.5px;font-weight:600;letter-spacing:2px;color:${ACENTO};line-height:1.4;text-transform:uppercase;">Suite Contable</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Tarjeta -->
        <tr>
          <td style="background:#FFFFFF;border:1px solid ${BORDE};border-radius:14px;">

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:32px 32px 8px 32px;">
                  <h1 style="margin:0 0 12px 0;font-family:${FUENTE};font-size:21px;font-weight:700;letter-spacing:-0.3px;color:${INK};line-height:1.3;">
                    Te invitaron a ${org}
                  </h1>
                  <p style="margin:0;font-family:${FUENTE};font-size:14.5px;line-height:1.6;color:${INK_2};">
                    <strong style="color:${INK};font-weight:600;">${nombre}</strong>${mail ? ` (${mail})` : ''} te sumó a
                    <strong style="color:${INK};font-weight:600;">${org}</strong> en Orddo, la suite contable del estudio.
                  </p>
                </td>
              </tr>

              <!-- Detalle -->
              <tr>
                <td style="padding:20px 32px 0 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FONDO};border-radius:10px;">
                    <tr>
                      <td style="padding:14px 16px;font-family:${FUENTE};font-size:12px;color:${INK_3};letter-spacing:0.4px;text-transform:uppercase;font-weight:600;width:38%;">Estudio</td>
                      <td style="padding:14px 16px;font-family:${FUENTE};font-size:14px;color:${INK};font-weight:600;text-align:right;">${org}</td>
                    </tr>
                    <tr>
                      <td style="padding:0 16px 14px 16px;font-family:${FUENTE};font-size:12px;color:${INK_3};letter-spacing:0.4px;text-transform:uppercase;font-weight:600;">Tu rol</td>
                      <td style="padding:0 16px 14px 16px;font-family:${FUENTE};font-size:14px;color:${INK};font-weight:600;text-align:right;">${rol}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Botón. La tabla con bordes redondeados es para Outlook, que
                   ignora el border-radius del <a>. -->
              <tr>
                <td style="padding:24px 32px 0 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:${ACENTO};border-radius:8px;">
                        <a href="${d.inviteLink}"
                           style="display:inline-block;padding:12px 22px;font-family:${FUENTE};font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                          Aceptar la invitación
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:20px 32px 28px 32px;">
                  <p style="margin:0;font-family:${FUENTE};font-size:12.5px;line-height:1.6;color:${INK_3};">
                    Si el botón no funciona, copiá y pegá este enlace en el navegador:<br>
                    <span style="color:${ACENTO};word-break:break-all;">${escapeHtml(d.inviteLink)}</span>
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:0 32px 28px 32px;">
                  <div style="height:1px;background:${BORDE};line-height:1px;font-size:0;">&nbsp;</div>
                  <p style="margin:16px 0 0 0;font-family:${FUENTE};font-size:12.5px;line-height:1.6;color:${INK_3};">
                    El enlace vence en 48 horas. Si no esperabas esta invitación, ignorá este correo: no se crea ninguna cuenta hasta que la aceptes.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style="padding:20px 4px 0 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:7px;vertical-align:middle;">
                  <div style="width:7px;height:7px;background:${TURQUESA};border-radius:7px;font-size:0;line-height:0;">&nbsp;</div>
                </td>
                <td style="vertical-align:middle;font-family:${FUENTE};font-size:11.5px;color:${INK_4};">
                  Orddo · Suite Contable — correo automático, no hace falta responder.
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * La versión en texto plano. No es un formalismo: los filtros de spam
 * desconfían de los correos que sólo traen HTML, y algunos clientes —relojes,
 * lectores de pantalla, vistas previas— muestran esta y no la otra.
 */
function invitacionTexto(d: {
  inviteLink: string;
  inviterName: string;
  organizacion: string;
  rol: string;
}): string {
  return `${d.inviterName} te invitó a ${d.organizacion} en Orddo, la suite contable del estudio.

Tu rol: ${d.rol}

Aceptá la invitación entrando acá:
${d.inviteLink}

El enlace vence en 48 horas. Si no esperabas esta invitación, ignorá este correo: no se crea ninguna cuenta hasta que la aceptes.

— Orddo · Suite Contable`;
}
