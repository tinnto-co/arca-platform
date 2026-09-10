/**
 * Período fiscal en un solo control: "Agosto 2026".
 *
 * Reemplaza al par mes + año, que obligaba a dos decisiones para una sola
 * cosa y dejaba pasar combinaciones inválidas —elegir diciembre y después
 * 2026 estando en septiembre— que cada pantalla tenía que corregir a mano.
 * Acá la lista ya es cronológica y no llega más allá del mes en curso.
 *
 * Habla en `YYYY-MM`, que es como se arma el período en el resto del sistema.
 */
import { SearchableSelect } from '@/components/ui/searchable-select';

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
  width = 190,
  className,
}: {
  /** `YYYY-MM`. */
  periodo: string;
  onPeriodo: (periodo: string) => void;
  aniosAtras?: number;
  width?: number;
  className?: string;
}) {
  const hoy = new Date();

  // Del mes en curso hacia atrás: el futuro no es un período liquidable.
  const opciones: { value: string; label: string }[] = [];
  for (let i = 0; i < aniosAtras * 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const p = aPeriodo(d.getFullYear(), d.getMonth());
    opciones.push({ value: p, label: nombrePeriodo(p) });
  }

  // Un período viejo que venga de la URL o de un dato guardado tiene que poder
  // mostrarse aunque quede fuera de la ventana.
  if (periodo && !opciones.some((o) => o.value === periodo)) {
    opciones.push({ value: periodo, label: nombrePeriodo(periodo) });
    opciones.sort((a, b) => b.value.localeCompare(a.value));
  }

  return (
    <div className={className}>
      <SearchableSelect
        value={periodo}
        onValueChange={onPeriodo}
        placeholder="Período"
        searchPlaceholder="Buscar mes o año..."
        options={opciones}
        width={width}
      />
    </div>
  );
}
