/**
 * Período fiscal en un solo control: "Agosto 2026".
 *
 * Reemplaza al par mes + año, que obligaba a dos decisiones para una sola
 * cosa y dejaba pasar combinaciones inválidas —elegir diciembre y después
 * 2026 estando en septiembre— que cada pantalla tenía que corregir a mano.
 *
 * Por dentro es el `MesPicker` —el mismo calendario de Sueldos—, así que
 * elegir un período se ve y se opera igual en toda la plataforma. Esta capa
 * existe porque IVA e IIBB hablan en `YYYY-MM` y el picker en (año, mes)
 * por separado: traduce entre los dos y mantiene el contrato que esas dos
 * pantallas ya usaban.
 */
import { MesPicker } from '@/components/shared/mes-picker';

const MESES = [
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

/** `2026-08` → `Agosto 2026`. */
export function nombrePeriodo(periodo: string): string {
  const [a, m] = periodo.split('-');
  const i = Number(m) - 1;
  return MESES[i] ? `${MESES[i]} ${a}` : periodo;
}

/** `(2026, 7)` → `2026-08`. El mes entra 0-11, como en `Date`. */
export const aPeriodo = (anio: number, mes: number): string =>
  `${anio}-${String(mes + 1).padStart(2, '0')}`;

/** `2026-08` → `{ anio: 2026, mes: 7 }`, con el mes 0-11. */
export function dePeriodo(periodo: string): { anio: number; mes: number } {
  const [a, m] = periodo.split('-');
  return { anio: Number(a), mes: Number(m) - 1 };
}

export function SelectorPeriodo({
  periodo,
  onPeriodo,
  /** Cuántos años hacia atrás ofrecer. */
  aniosAtras = 5,
  className,
}: {
  /** `YYYY-MM`. */
  periodo: string;
  onPeriodo: (periodo: string) => void;
  aniosAtras?: number;
  className?: string;
}) {
  const hoy = new Date();
  // El futuro no es un período liquidable: el picker apaga los meses
  // posteriores al corriente en vez de dejarlos elegir.
  const maxPeriodo = aPeriodo(hoy.getFullYear(), hoy.getMonth());
  const [ano, mes] = periodo.split('-');

  return (
    <MesPicker
      ano={ano}
      mes={mes}
      onChange={(a, m) => onPeriodo(`${a}-${m}`)}
      maxPeriodo={maxPeriodo}
      minAno={hoy.getFullYear() - aniosAtras}
      className={className}
    />
  );
}
