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

export async function sendOrganizationInvitationEmail(
  data: InvitationEmailPayload
): Promise<void> {
  const base =
    process.env.BETTER_AUTH_URL ||
    process.env.PUBLIC_APP_URL ||
    // 'http://localhost:3000'; // rollback: cambiar a 3000
    'http://localhost:3001';
  const inviteLink = `${base.replace(/\/$/, '')}/invite/${data.id}`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;

  if (!apiKey?.trim() || !from?.trim()) {
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
      from: from.trim(),
      to: [data.email],
      subject: `Invitación a ${data.organization.name} — ARCA`,
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>Hola,</p>
<p><strong>${escapeHtml(inviterName)}</strong>${inviterEmail ? ` (${escapeHtml(inviterEmail)})` : ''} te invitó a unirte a <strong>${escapeHtml(data.organization.name)}</strong> en ARCA.</p>
<p>Rol: <strong>${escapeHtml(data.role)}</strong></p>
<p><a href="${inviteLink}" style="display:inline-block;padding:10px 16px;background:#139ed9;color:#fff;text-decoration:none;border-radius:8px">Aceptar invitación</a></p>
<p style="font-size:14px;color:#666">Si el botón no funciona, abrí este enlace en el navegador:<br>${escapeHtml(inviteLink)}</p>
</body></html>`,
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
