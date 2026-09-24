/**
 * Envío de recibos de sueldo por mail al empleador (cliente).
 *
 * Resend: https://resend.com — API key en RESEND_API_KEY.
 * RESEND_FROM debe usar un remitente permitido por Resend (ver lib/send-invitation-email.ts).
 *
 * A diferencia de la invitación, acá no hay fallback sin Resend: si no está
 * configurado, se corta con error (no tiene sentido "loguear" un adjunto).
 */
interface RecibosEmailPayload {
  to: string;
  razonSocial: string | null;
  periodoLabel: string;
  attachment: { filename: string; contentBase64: string };
}

export async function sendRecibosEmail(
  data: RecibosEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? process.env.EMAIL_FROM;

  if (!apiKey?.trim() || !from?.trim()) {
    throw new Error(
      'No hay RESEND_API_KEY o RESEND_FROM/EMAIL_FROM configurado. No se pudo enviar el mail.'
    );
  }

  const empresa = data.razonSocial ?? 'tu empresa';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from.trim(),
      to: [data.to],
      subject: `Recibos de sueldo — ${data.periodoLabel} — ${empresa}`,
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<p>Hola,</p>
<p>Adjuntamos los recibos de sueldo de <strong>${escapeHtml(empresa)}</strong> correspondientes a <strong>${escapeHtml(data.periodoLabel)}</strong>.</p>
<p style="font-size:14px;color:#666">Este mail fue generado automáticamente desde ARCA.</p>
</body></html>`,
      attachments: [
        {
          filename: data.attachment.filename,
          content: data.attachment.contentBase64,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[recibos] Resend error:', res.status, body);
    throw new Error(`No se pudo enviar el mail de recibos (${res.status}).`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
