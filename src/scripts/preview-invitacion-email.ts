/**
 * Escupe el correo de invitación a un archivo para poder mirarlo sin mandarlo.
 *
 * Uso: bun run src/scripts/preview-invitacion-email.ts
 *      open /tmp/invitacion-preview.html
 */
import fs from 'node:fs';
import { invitacionHtml } from '../../lib/send-invitation-email';

const html = invitacionHtml({
  inviteLink: 'https://contable.tinnto.co/invite/EJEMPLO-DE-ID',
  inviterName: 'Adriana Cuellar',
  inviterEmail: 'adriana@tinnto.co',
  organizacion: 'Estudio BLAKG',
  rol: 'Miembro',
  base: 'https://contable.tinnto.co',
});

const salida = '/tmp/invitacion-preview.html';
fs.writeFileSync(salida, html);
console.log('Escrito en', salida);
