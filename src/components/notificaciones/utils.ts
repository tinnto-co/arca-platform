/**
 * Tokens y helpers de la bandeja de notificaciones.
 *
 * El modelo no tiene una columna `asunto`: el scrapper guarda el cuerpo entero
 * en `mensaje` y la IA deja un resumen en `ai_resumen`. El asunto se deriva de
 * la primera línea, que es como vienen redactadas las comunicaciones de AFIP.
 */

export const SEVERIDAD_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  accion_requerida: 'Acción requerida',
  informativa: 'Informativa',
  sin_clasificar: 'Sin clasificar',
};

export const SEVERIDAD_PILL: Record<string, string> = {
  urgente: 'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
  accion_requerida:
    'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]',
  informativa:
    'bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]',
  sin_clasificar:
    'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] border border-[var(--arca-border)]',
};

/**
 * Asunto y preview a partir del cuerpo. La primera línea es el asunto; el
 * resumen de la IA se prefiere como preview porque está escrito para eso, y si
 * no hay se cae al resto del texto.
 */
export function asuntoYPreview(mensaje: string, aiResumen: string | null) {
  const lineas = mensaje
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const asunto = lineas[0] ?? 'Sin asunto';
  const resto = lineas.slice(1).join(' ');
  const preview = (aiResumen ?? resto ?? '').trim();

  return { asunto, preview };
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const soloDia = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Etiqueta del grupo al que pertenece una fecha: `Hoy`, `Ayer`,
 * `Semana pasada`, y después el mes.
 */
export function grupoDeFecha(fecha: Date | string) {
  const f = new Date(fecha);
  const dias = Math.round((soloDia(new Date()) - soloDia(f)) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias <= 7) return 'Semana pasada';
  return `${MESES[f.getMonth()]} ${f.getFullYear()}`;
}

/** `11:24` si es de hoy, `14/08` si es más vieja. */
export function horaOFecha(fecha: Date | string) {
  const f = new Date(fecha);
  const hoy = soloDia(new Date()) === soloDia(f);
  return hoy
    ? `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`
    : `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`;
}

/** `07/08/2026, 11:24` — el formato largo del panel de lectura. */
export function fechaHoraLarga(fecha: Date | string) {
  const f = new Date(fecha);
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${f.getFullYear()}, ${hh}:${mi}`;
}

/** `hace 4 min` · `hace 3 h` · `hace 2 d`. */
export function haceCuanto(fecha: Date | string | null | undefined) {
  if (!fecha) return null;
  const seg = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000);
  if (seg < 60) return 'recién';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  return `hace ${Math.floor(hs / 24)} d`;
}

export function iniciales(nombre: string | null | undefined, cantidad = 2) {
  if (!nombre) return '?';
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, cantidad)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
