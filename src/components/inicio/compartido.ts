/**
 * Helpers del Inicio: mapeo de impuestos a tiles, fechas y avatares.
 *
 * La regla de la pantalla: izquierda = tiempo, derecha = riesgo y equipo,
 * franja de arriba = infraestructura. Nada entra si no cae en una de esas.
 */

/** Colores de tile por familia de trámite (tokens de app.css). */
const FAMILIAS = {
  previsional: {
    bg: 'var(--arca-accent-info-bg)',
    fg: 'var(--arca-accent-info-fg)',
  },
  impositivo: {
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
  },
  sueldos: {
    bg: 'var(--arca-accent-pos-bg)',
    fg: 'var(--arca-accent-pos-fg)',
  },
  fiscalizacion: {
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
  },
  otro: { bg: 'var(--arca-surface-2)', fg: 'var(--arca-ink-3)' },
} as const;

export interface Tile {
  codigo: string;
  bg: string;
  fg: string;
}

/**
 * El impuesto de AFIP viene como "30 - IVA" o "308 - APORTES SEG.SOCIAL...".
 * El tile muestra el código (o una sigla cuando el nombre es más claro) con
 * el color de su familia.
 */
export function tileDeImpuesto(impuesto: string): Tile {
  const [, codigo = '', nombre = ''] =
    /^(\d+)\s*-\s*(.*)$/.exec(impuesto) ?? [];
  const n = nombre.toLowerCase();

  if (n.includes('iva')) return { codigo: 'IVA', ...FAMILIAS.impositivo };
  if (n.includes('monotributo'))
    return { codigo: 'MT', ...FAMILIAS.impositivo };
  if (n.includes('suss')) return { codigo: '931', ...FAMILIAS.sueldos };
  if (
    n.includes('aportes') ||
    n.includes('autonomos') ||
    n.includes('casas parti') ||
    n.includes('obra social') ||
    n.includes('art ')
  )
    return { codigo: codigo || '?', ...FAMILIAS.previsional };
  if (n.includes('fiscaliz'))
    return { codigo: 'FE', ...FAMILIAS.fiscalizacion };

  return { codigo: codigo.slice(0, 4) || '?', ...FAMILIAS.otro };
}

/** "APORTES SEG.SOCIAL AUTONOMOS" → "Aportes seg.social autonomos". */
export function nombreDeImpuesto(impuesto: string): string {
  const nombre = impuesto.replace(/^\d+\s*-\s*/, '').trim();
  const bajo = nombre.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

export function nombreDeConcepto(concepto: string): string {
  return nombreDeImpuesto(concepto);
}

/** Parse local de un `date` de la BD (YYYY-MM-DD): por UTC correría un día. */
export function fechaLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function aFechaStr(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const DIAS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
export const MESES_LARGOS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** "Domingo 6" — el encabezado de grupo de la agenda. */
export function diaLargo(s: string): string {
  const d = fechaLocal(s);
  const nombre = DIAS[d.getDay()];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d.getDate()}`;
}

export function diaCorto(d: Date): string {
  return DIAS_CORTOS[d.getDay()];
}

/** "en 5 d" / "hoy" / "hace 2 d". */
export function enDias(s: string, hoy: Date): string {
  const dias = Math.round(
    (fechaLocal(s).getTime() - fechaLocal(aFechaStr(hoy)).getTime()) /
      86_400_000
  );
  if (dias === 0) return 'hoy';
  return dias > 0 ? `en ${dias} d` : `hace ${-dias} d`;
}

/** "hace 11 d" para timestamps (notificaciones). */
export function haceDias(iso: string, ahora: Date): string {
  const dias = Math.floor(
    (ahora.getTime() - new Date(iso).getTime()) / 86_400_000
  );
  if (dias <= 0) return 'hoy';
  return `hace ${dias} d`;
}

/** "9 sep". */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

/** "$ 62.140.500" — es-AR, sin decimales, sin código de moneda. */
export function pesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`;
}

// ── Avatares ───────────────────────────────────────────────────────────────

const COLORES_AVATAR = ['#2A4680', '#7AA2C8', '#8FB39F', '#C2A878'];

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? '';
  const b =
    partes.length > 1
      ? (partes[partes.length - 1]?.[0] ?? '')
      : (partes[0]?.[1] ?? '');
  return (a + b).toUpperCase();
}

export function colorAvatar(nombre: string): string {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[h % COLORES_AVATAR.length];
}
