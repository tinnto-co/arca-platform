import type { listTareas } from '@/actions/tareas';

export type TareaConDetalle = Awaited<ReturnType<typeof listTareas>>[number];

export type TipoTarea =
  | 'iva'
  | 'iibb'
  | 'ddjj'
  | 'sueldos'
  | 'convenios'
  | 'otro';
export type EstadoTarea = 'pendiente' | 'presentada' | 'verificada';

export const TIPO_LABELS: Record<string, string> = {
  iva: 'IVA',
  iibb: 'IIBB',
  ddjj: 'DDJJ',
  sueldos: 'Sueldos',
  convenios: 'Convenios',
  otro: 'Otro',
};

/**
 * Las pills de tipo salen del design system, no de la paleta de Tailwind.
 * Sólo IVA lleva color propio —es la obligación que más se mira—; el resto
 * son neutras, como pide el handoff: color con intención, no decorativo.
 */
export const TIPO_PILL: Record<string, string> = {
  iva: 'bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]',
  iibb: 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] border border-[var(--arca-border)]',
  ddjj: 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] border border-[var(--arca-border)]',
  sueldos:
    'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] border border-[var(--arca-border)]',
  convenios:
    'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] border border-[var(--arca-border)]',
  otro: 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] border border-[var(--arca-border)]',
};

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  presentada: 'Presentada',
  verificada: 'Verificada',
};

/** Color del punto de estado. Pendiente es neutro a propósito. */
export const ESTADO_DOT: Record<string, string> = {
  pendiente: 'var(--arca-ink-4)',
  presentada: 'var(--arca-accent-info)',
  verificada: 'var(--arca-accent-pos)',
};

/** Iniciales para los avatares generados: no hay imágenes en el sistema. */
export function iniciales(nombre: string | null | undefined, cantidad = 2) {
  if (!nombre) return '?';
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, cantidad)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Estado de un vencimiento respecto de hoy. `dias` es negativo si ya venció.
 * Devuelve también la etiqueta corta que va en la pill (`+8 d`, `3 d`, `hoy`).
 */
export function vencimiento(fecha: Date | string | null | undefined) {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d.getTime() - hoy.getTime()) / 86_400_000);

  if (dias < 0) {
    return {
      dias,
      tono: 'neg' as const,
      etiqueta: `+${Math.abs(dias)} d`,
      sufijo: `+${Math.abs(dias)} d`,
    };
  }
  if (dias === 0)
    return { dias, tono: 'warn' as const, etiqueta: 'hoy', sufijo: 'hoy' };
  if (dias <= 3)
    return {
      dias,
      tono: 'warn' as const,
      etiqueta: `${dias} d`,
      sufijo: `en ${dias} d`,
    };
  return {
    dias,
    tono: 'neutro' as const,
    etiqueta: `${dias} d`,
    sufijo: `en ${dias} d`,
  };
}

export const TONO_PILL: Record<string, string> = {
  neg: 'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
  warn: 'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]',
  neutro: 'border border-[var(--arca-border-strong)] text-[var(--arca-ink-3)]',
};
