/** Tipos y helpers compartidos de la vista "Nuevo recibo". */
import type {
  listImportEmpleadosConConfig,
  getBasicoParaEmpleadoPeriodo,
  listSituaciones,
} from '@/actions/sueldos';

export type EmpleadoConfigRow = Awaited<
  ReturnType<typeof listImportEmpleadosConConfig>
>[number];

export type BasicoInfo = Awaited<
  ReturnType<typeof getBasicoParaEmpleadoPeriodo>
>;

export type SituacionRow = Awaited<ReturnType<typeof listSituaciones>>[number];

/** Tipo persistido en `recibo.tipo` (el chip "Sueldo" + quincena ≠ 0 mapea a 'quincenal'). */
export type TipoReciboNuevo =
  | 'mensual'
  | 'quincenal'
  | 'anticipo'
  | 'sac'
  | 'vacaciones'
  | 'liquidacion_final'
  | 'comisiones'
  | 'fondo_desempleo'
  | 'otros';

/** Chips de tipo del diseño (8) → enum de recibo. */
export const TIPOS_CHIP: { value: TipoReciboNuevo; label: string }[] = [
  { value: 'mensual', label: 'Sueldo' },
  { value: 'anticipo', label: 'Anticipo' },
  { value: 'sac', label: 'SAC' },
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'liquidacion_final', label: 'Liquidación final' },
  { value: 'comisiones', label: 'Comisiones' },
  { value: 'fondo_desempleo', label: 'Fondo de desempleo' },
  { value: 'otros', label: 'Varios' },
];

export const TIPO_LABELS: Record<string, string> = {
  mensual: 'sueldo',
  quincenal: 'quincenal',
  anticipo: 'anticipo',
  sac: 'SAC',
  vacaciones: 'vacaciones',
  liquidacion_final: 'liquidación final',
  comisiones: 'comisiones',
  fondo_desempleo: 'fondo de desempleo',
  otros: 'varios',
};

export const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  deposito: 'Depósito',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
};

export type Quincena = '0' | '1' | '2';

export const MES_LABELS = [
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

export const MES_NOMBRES = [
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

// ---------------------------------------------------------------------------
// Fechas por aritmética de strings (nunca `new Date('YYYY-MM-DD')` — parsea UTC)
// ---------------------------------------------------------------------------

export function ultimoDiaDelMes(anio: number, mes: number): number {
  // mes 1-12; new Date(y, m, 0) usa hora local, sin parseo UTC.
  return new Date(anio, mes, 0).getDate();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM' del período seleccionado. */
export function periodoDe(anio: number, mes: number): string {
  return `${anio}-${pad2(mes)}`;
}

/** Fecha de pago ISO: día 15 en 1ra quincena, último día del mes si no. */
export function fechaPagoDe(
  anio: number,
  mes: number,
  quincena: Quincena
): string {
  const dia = quincena === '1' ? 15 : ultimoDiaDelMes(anio, mes);
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}

/** Depósito de cargas ISO: día 10 del mes siguiente. */
export function fechaDepositoCargasDe(anio: number, mes: number): string {
  const [y, m] = mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
  return `${y}-${pad2(m)}-10`;
}

export function fmtFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Años completos entre fechaAlta (ISO) y el último día del período. */
export function antiguedadAnios(
  fechaAlta: string | null | undefined,
  anio: number,
  mes: number
): number | null {
  if (!fechaAlta) return null;
  const [ay, am, ad] = fechaAlta.slice(0, 10).split('-').map(Number);
  if (!ay || !am || !ad) return null;
  const finDia = ultimoDiaDelMes(anio, mes);
  let anios = anio - ay;
  if (mes < am || (mes === am && finDia < ad)) anios -= 1;
  return Math.max(0, anios);
}

export function iniciales(nombre: string): string {
  const parts = nombre.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
}

/** `$ 1.137.677,00` es-AR; negativos con − (U+2212). */
export function fmtMonto(n: number): string {
  const abs = Math.abs(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `\u2212 $ ${abs}` : `$ ${abs}`;
}
