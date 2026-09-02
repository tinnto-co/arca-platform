/**
 * Franja de carga por día (o por semana, en la vista trimestre).
 * La barra mide la cantidad de vencimientos; click filtra la agenda.
 */

export interface CeldaDia {
  clave: string;
  /** "MAR" / "SEM" */
  labelArriba: string;
  /** "1" / "15 sep" */
  labelNumero: string;
  cantidad: number;
  esHoy: boolean;
  esFinde: boolean;
  /** Rango que filtra la agenda al clickear (desde, hasta). */
  rango: [string, string];
}

function colorBarra(cantidad: number, pico: number): string {
  if (cantidad >= Math.max(4, pico)) return 'var(--arca-navy-700)';
  if (cantidad >= 2) return 'var(--arca-chart-3)';
  return 'var(--arca-border-strong)';
}

export function FranjaDias({
  celdas,
  seleccion,
  onSeleccionar,
}: {
  celdas: CeldaDia[];
  seleccion: string | null;
  onSeleccionar: (clave: string | null) => void;
}) {
  const pico = Math.max(1, ...celdas.map((c) => c.cantidad));

  return (
    <div
      className="bg-white border rounded-[14px] overflow-hidden grid"
      style={{
        borderColor: 'var(--arca-border)',
        gridTemplateColumns: `repeat(${celdas.length}, 1fr)`,
      }}
    >
      {celdas.map((c, i) => {
        const activa = seleccion === c.clave;
        return (
          <button
            key={c.clave}
            type="button"
            onClick={() => onSeleccionar(activa ? null : c.clave)}
            className="flex flex-col items-center gap-2 cursor-pointer transition-colors duration-150"
            style={{
              padding: '14px 0 12px',
              borderRight:
                i < celdas.length - 1
                  ? '1px solid var(--arca-border)'
                  : undefined,
              background: activa
                ? 'var(--arca-border)'
                : c.esHoy || c.esFinde
                  ? 'var(--arca-surface-2)'
                  : undefined,
            }}
            aria-pressed={activa}
            title={`${c.cantidad} vencimiento${c.cantidad !== 1 ? 's' : ''}`}
          >
            <span
              className="text-[9.5px] font-semibold uppercase"
              style={{ letterSpacing: '0.1em', color: 'var(--arca-ink-4)' }}
            >
              {c.labelArriba}
            </span>
            <span
              className="text-[16px] font-bold tabular-nums"
              style={{
                fontFamily: 'var(--ff-display)',
                color: 'var(--arca-ink)',
              }}
            >
              {c.labelNumero}
            </span>
            <span className="h-[26px] flex items-end">
              {c.cantidad > 0 && (
                <span
                  className="block w-2 rounded-[2px]"
                  style={{
                    height: Math.min(24, Math.max(8, c.cantidad * 8)),
                    background: colorBarra(c.cantidad, pico),
                  }}
                />
              )}
            </span>
            <span
              className="text-[10.5px] tabular-nums"
              style={{
                color:
                  c.cantidad === 0
                    ? 'var(--arca-border-strong)'
                    : c.cantidad === pico
                      ? 'var(--arca-ink)'
                      : 'var(--arca-ink-3)',
                fontWeight: c.esHoy || c.cantidad === pico ? 600 : 400,
              }}
            >
              {c.esHoy ? 'hoy' : c.cantidad === 0 ? '—' : c.cantidad}
            </span>
          </button>
        );
      })}
    </div>
  );
}
