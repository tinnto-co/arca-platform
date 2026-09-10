/**
 * Franja de carga por día (o por semana, en la vista trimestre).
 * La barra mide la cantidad de vencimientos; click filtra la agenda.
 *
 * Escala: altura y color son relativos al día más cargado del rango visible
 * ("el pico"). Una escala absoluta no sirve acá porque la carga de un estudio
 * va de 1 a 50 vencimientos diarios según la época del mes. Los cortes reales
 * se muestran en la leyenda, así que el usuario puede verificarlos contra el
 * número de cada celda.
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

const NIVELES = [
  { label: 'baja', color: 'var(--arca-border-strong)' },
  { label: 'media', color: 'var(--arca-chart-3)' },
  { label: 'alta', color: 'var(--arca-navy-700)' },
] as const;

/** Cortes de la escala: [hasta baja, hasta media]. El resto es alta. */
function cortes(pico: number): [number, number] {
  return [Math.ceil(pico / 3), Math.ceil((pico * 2) / 3)];
}

function nivelDe(cantidad: number, pico: number): 0 | 1 | 2 {
  const [t1, t2] = cortes(pico);
  if (cantidad <= t1) return 0;
  if (cantidad <= t2) return 1;
  return 2;
}

/** 8px el día más flojo, 24px el pico. Proporcional, sin saturar. */
function alturaBarra(cantidad: number, pico: number): number {
  return Math.round(8 + (cantidad / pico) * 16);
}

/** "1–16" · "17" cuando el tramo es un solo valor. */
function rangoTexto(desde: number, hasta: number): string {
  return desde === hasta ? String(desde) : `${desde}–${hasta}`;
}

function Leyenda({ pico, unidad }: { pico: number; unidad: 'día' | 'semana' }) {
  const [t1, t2] = cortes(pico);
  // Tramos vacíos (pasa con picos chicos: t1 === t2 === pico) se descartan.
  const tramos = [
    { nivel: 0, desde: 1, hasta: t1 },
    { nivel: 1, desde: t1 + 1, hasta: t2 },
    { nivel: 2, desde: t2 + 1, hasta: pico },
  ].filter((t) => t.desde <= t.hasta);

  return (
    <div
      className="flex items-center justify-between flex-wrap"
      style={{
        padding: '10px 16px',
        gap: 12,
        borderTop: '1px solid var(--arca-border)',
        background: 'var(--arca-surface-2)',
      }}
    >
      <span className="text-[11.5px]" style={{ color: 'var(--arca-ink-3)' }}>
        Cada barra son los vencimientos{' '}
        {unidad === 'día' ? 'del día' : 'de la semana'}
      </span>

      <div className="flex items-center flex-wrap" style={{ gap: 14 }}>
        <span
          className="text-[9.5px] font-semibold uppercase"
          style={{ letterSpacing: '0.08em', color: 'var(--arca-ink-4)' }}
        >
          Carga
        </span>

        {tramos.map((t) => (
          <span key={t.nivel} className="flex items-center" style={{ gap: 6 }}>
            <span
              className="block w-2 rounded-[2px]"
              style={{
                height: [10, 16, 22][t.nivel],
                background: NIVELES[t.nivel].color,
              }}
            />
            <span
              className="text-[11.5px]"
              style={{ color: 'var(--arca-ink-3)' }}
            >
              {NIVELES[t.nivel].label}{' '}
              <span
                className="tabular-nums"
                style={{ color: 'var(--arca-ink-4)' }}
              >
                {rangoTexto(t.desde, t.hasta)}
              </span>
            </span>
          </span>
        ))}

        <span
          aria-hidden
          style={{
            width: 1,
            height: 14,
            background: 'var(--arca-border-strong)',
          }}
        />

        <span className="flex items-center" style={{ gap: 6 }}>
          <span
            className="text-[11.5px] tabular-nums"
            style={{ color: 'var(--arca-border-strong)' }}
          >
            —
          </span>
          <span
            className="text-[11.5px]"
            style={{ color: 'var(--arca-ink-3)' }}
          >
            sin vencimientos
          </span>
        </span>

        <span className="flex items-center" style={{ gap: 6 }}>
          <span
            className="block rounded-[1px]"
            style={{
              width: 12,
              height: 2,
              background: 'var(--arca-navy-700)',
            }}
          />
          <span
            className="text-[11.5px]"
            style={{ color: 'var(--arca-ink-3)' }}
          >
            hoy
          </span>
        </span>
      </div>
    </div>
  );
}

export function FranjaDias({
  celdas,
  seleccion,
  onSeleccionar,
  unidad = 'día',
}: {
  celdas: CeldaDia[];
  seleccion: string | null;
  onSeleccionar: (clave: string | null) => void;
  /** En la vista trimestre cada celda es una semana. */
  unidad?: 'día' | 'semana';
}) {
  const pico = Math.max(1, ...celdas.map((c) => c.cantidad));

  return (
    <div
      className="bg-white border rounded-[14px] overflow-hidden"
      style={{ borderColor: 'var(--arca-border)' }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${celdas.length}, 1fr)` }}
      >
        {celdas.map((c, i) => {
          const activa = seleccion === c.clave;
          const etiqueta =
            c.cantidad === 0
              ? `Sin vencimientos`
              : `${c.cantidad} vencimiento${c.cantidad !== 1 ? 's' : ''} · carga ${NIVELES[nivelDe(c.cantidad, pico)].label}`;

          return (
            <button
              key={c.clave}
              type="button"
              onClick={() => onSeleccionar(activa ? null : c.clave)}
              className="relative flex flex-col items-center gap-2 cursor-pointer transition-colors duration-150"
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
              title={`${c.labelArriba} ${c.labelNumero}${c.esHoy ? ' (hoy)' : ''} · ${etiqueta}`}
              aria-label={`${c.labelArriba} ${c.labelNumero}${c.esHoy ? ', hoy' : ''}, ${etiqueta}`}
            >
              <span
                className="text-[9.5px] font-semibold uppercase"
                style={{
                  letterSpacing: '0.1em',
                  color: c.esHoy ? 'var(--arca-navy-700)' : 'var(--arca-ink-4)',
                }}
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
                      height: alturaBarra(c.cantidad, pico),
                      background: NIVELES[nivelDe(c.cantidad, pico)].color,
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
                {c.cantidad === 0 ? '—' : c.cantidad}
              </span>

              {/* Rail de hoy: marca la columna sin ocupar el slot del número. */}
              {c.esHoy && (
                <span
                  aria-hidden
                  className="absolute left-0 right-0 bottom-0"
                  style={{ height: 2, background: 'var(--arca-navy-700)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      <Leyenda pico={pico} unidad={unidad} />
    </div>
  );
}
