/**
 * Control bancario: lo que entró al banco contra lo facturado, y lo que salió
 * contra lo comprado, en el mismo período.
 *
 * Es la vista principal del módulo desde la reunión del 23/9: el estudio no
 * busca cruzar factura por factura, busca ver si los totales cierran y, cuando
 * no cierran, entender por qué. Por eso la diferencia viene acompañada del
 * desglose por concepto, que es lo que la explica (retenciones, impuestos,
 * comisiones).
 *
 * La ventana puede ser de más de un mes: lo facturado en agosto suele cobrarse
 * en septiembre, y mes a mes la brecha asusta sin motivo.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Scale,
  Loader2,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getControlBancario } from '@/actions/bank';
import { MesPicker } from '@/components/shared/mes-picker';
import { CATEGORIA_MOVIMIENTO_LABEL } from '@/lib/clasificar-movimiento';
import type { SemaforoIncongruencia } from '@/lib/extracto-calc';

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const COLOR: Record<SemaforoIncongruencia, string> = {
  ok: 'var(--arca-accent-pos-fg, oklch(0.4 0.12 145))',
  atencion: 'var(--arca-accent-warn-fg)',
  alerta: 'var(--arca-accent-neg, oklch(0.5 0.18 25))',
};

/** Ventanas de comparación. Un mes solo engaña: lo de agosto se cobra en septiembre. */
const VENTANAS = [
  { meses: 1, label: '1 mes' },
  { meses: 2, label: '2 meses' },
  { meses: 3, label: '3 meses' },
  { meses: 6, label: '6 meses' },
  { meses: 12, label: '12 meses' },
];

type Control = Awaited<ReturnType<typeof getControlBancario>>;
type Lado = Control['ingresos'];

/** El mes anterior: los extractos se cargan a mes vencido. */
function mesAnterior(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Badge de entrada o salida: el color y la flecha se leen antes que el texto. */
function Insignia({
  direccion,
  texto,
}: {
  direccion: 'ingreso' | 'egreso';
  texto: string;
}) {
  const entra = direccion === 'ingreso';
  const Flecha = entra ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: entra
          ? 'var(--arca-accent-pos-bg, oklch(0.95 0.05 145))'
          : 'var(--arca-accent-neg-bg, oklch(0.95 0.04 25))',
        color: entra
          ? 'var(--arca-accent-pos-fg, oklch(0.4 0.12 145))'
          : 'var(--arca-accent-neg, oklch(0.5 0.18 25))',
      }}
    >
      <Flecha className="size-3" strokeWidth={2.5} />
      {texto}
    </span>
  );
}

/** Una de las dos comparaciones, con su diferencia. */
function Comparacion({
  titulo,
  banco,
  etiquetaBanco,
  etiquetaComprobantes,
  referencia,
  lado,
  explicacion,
}: {
  titulo: string;
  banco: number;
  etiquetaBanco: string;
  etiquetaComprobantes: string;
  /** Cómo se nombra la referencia dentro de una frase: "lo facturado". */
  referencia: string;
  lado: Lado;
  explicacion: string;
}) {
  const color = COLOR[lado.nivel];
  return (
    <div className="rounded-[10px] border border-[var(--arca-border)] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
        {titulo}
      </p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] text-[var(--arca-ink-3)]">
            {etiquetaBanco}
          </p>
          <p className="text-[15px] font-semibold tabular-nums text-[var(--arca-ink)]">
            {fmt.format(banco)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-[var(--arca-ink-3)]">
            {etiquetaComprobantes}
          </p>
          <p className="text-[15px] font-semibold tabular-nums text-[var(--arca-ink)]">
            {fmt.format(lado.comprobantes)}
          </p>
        </div>
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="w-fit cursor-help text-[11px] text-[var(--arca-ink-3)] underline decoration-dotted underline-offset-2">
                Diferencia
              </p>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-[12px] leading-snug">
              {etiquetaBanco} menos {referencia}. El % es sobre {referencia}.
            </TooltipContent>
          </Tooltip>
          <p
            className="text-[15px] font-semibold tabular-nums"
            style={{ color }}
          >
            {lado.diferencia > 0 ? '+' : ''}
            {fmt.format(lado.diferencia)}
            {/* Sin comprobantes el porcentaje no significa nada: la cuenta
                sería sobre cero. Pasa de verdad (Chirin, agosto 2026: entraron
                $12,5M sin una sola factura emitida). */}
            <span className="ml-1 text-[11px] font-normal">
              {lado.comprobantes === 0
                ? 'sin comprobantes'
                : `(${lado.porcentaje}%)`}
            </span>
          </p>
        </div>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--arca-ink-3)]">
        {explicacion}
      </p>
    </div>
  );
}

export function ControlBancarioCard({
  clienteId,
  periodo,
  onPeriodoChange,
}: {
  clienteId: string;
  /** Último mes de la ventana, 'YYYY-MM'. Lo manda la URL de Banco. */
  periodo?: string;
  onPeriodoChange: (mes: string) => void;
}) {
  // La ventana arranca siempre en un mes: es el período con el que trabaja el
  // estudio. Mirar más meses es una decisión puntual, así que no se recuerda
  // al cambiar de empresa o de mes.
  const [meses, setMeses] = useState(1);
  const [verDesglose, setVerDesglose] = useState(false);
  const mes = periodo ?? mesAnterior();
  // Se ajusta durante el render, no en un efecto: así la card nunca llega a
  // pintarse con la ventana de la empresa anterior.
  const [clave, setClave] = useState(`${clienteId}|${mes}`);
  if (clave !== `${clienteId}|${mes}`) {
    setClave(`${clienteId}|${mes}`);
    setMeses(1);
  }

  const { data, isFetching } = useQuery({
    queryKey: ['controlBancario', clienteId, mes, meses],
    queryFn: () =>
      getControlBancario({ data: { clienteId, periodo: mes, meses } }),
    enabled: !!clienteId,
    // Cambiar de mes deja los números anteriores atenuados en vez de vaciar la
    // card: desaparecer y volver se lee como que algo se rompió.
    placeholderData: (previo) => previo,
  });

  const desglose = data?.desglose ?? [];

  return (
    <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="size-4 text-[var(--arca-ink-2)]" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Control bancario
        </span>
        {isFetching && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--arca-ink-4)]">
            <Loader2 className="size-3 animate-spin" />
            Actualizando…
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* La ventana: mirar dos meses juntos absorbe el desfase entre lo
              facturado y lo cobrado. */}
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="h-7 rounded-[8px] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-2 text-[11.5px] text-[var(--arca-ink-2)]"
          >
            {VENTANAS.map((v) => (
              <option key={v.meses} value={v.meses}>
                {v.label}
              </option>
            ))}
          </select>
          <MesPicker
            size="sm"
            ano={mes.slice(0, 4)}
            mes={mes.slice(5, 7)}
            onChange={(ano, m) => onPeriodoChange(`${ano}-${m}`)}
          />
        </div>
      </div>

      <div
        className={
          isFetching ? 'opacity-45 transition-opacity duration-150' : ''
        }
      >
        {!data ? (
          <p className="mt-3 text-[12.5px] text-[var(--arca-ink-3)]">
            Cargando…
          </p>
        ) : data.movimientos === 0 ? (
          <p className="mt-3 text-[12.5px] text-[var(--arca-ink-3)]">
            Sin movimientos bancarios en el período. Importá el extracto para
            comparar.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Comparacion
                titulo="Ingresos"
                banco={data.ingresos.banco}
                etiquetaBanco="Entró al banco"
                etiquetaComprobantes="Se facturó"
                referencia="lo que se facturó"
                lado={data.ingresos}
                explicacion={
                  data.ingresos.diferencia > 0
                    ? 'Entró más de lo facturado: puede haber cobros de facturas de meses anteriores o ventas sin facturar.'
                    : 'Se facturó más de lo que entró: puede haber facturas todavía no cobradas, retenciones o cobros en efectivo.'
                }
              />
              <Comparacion
                titulo="Egresos"
                banco={data.egresos.banco}
                etiquetaBanco="Salió del banco"
                etiquetaComprobantes="Se compró"
                referencia="lo que se compró"
                lado={data.egresos}
                explicacion={
                  data.egresos.diferencia > 0
                    ? 'Salió más de lo comprado: impuestos, sueldos y comisiones no tienen factura de proveedor. El desglose lo explica.'
                    : 'Se compró más de lo que salió: puede haber facturas todavía impagas.'
                }
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--arca-ink-4)]">
              <span>
                {data.movimientos} movimiento
                {data.movimientos !== 1 ? 's' : ''} ·{' '}
                {data.ingresos.cantidadComprobantes} emitida
                {data.ingresos.cantidadComprobantes !== 1 ? 's' : ''} ·{' '}
                {data.egresos.cantidadComprobantes} recibida
                {data.egresos.cantidadComprobantes !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => setVerDesglose((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
              >
                {verDesglose ? 'Ocultar' : 'Ver'} el desglose por concepto
                <ChevronDown
                  className={`size-3 transition-transform ${verDesglose ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {/* El desglose es lo que explica la diferencia: qué parte de lo
                que entró o salió son impuestos, comisiones o sueldos. Va en
                dos bloques, porque mezclar lo que entra con lo que sale en una
                sola lista obliga a leer fila por fila para ubicarse. */}
            {verDesglose && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(
                  [
                    ['ingreso', 'Entró', data.ingresos.banco],
                    ['egreso', 'Salió', data.egresos.banco],
                  ] as const
                ).map(([direccion, titulo, total]) => {
                  const filas = desglose.filter(
                    (d) => d.direccion === direccion
                  );
                  return (
                    <div
                      key={direccion}
                      className="overflow-hidden rounded-[10px] border border-[var(--arca-border)]"
                    >
                      <div className="flex items-center gap-2 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-3 py-2">
                        <Insignia direccion={direccion} texto={titulo} />
                        <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-[var(--arca-ink)]">
                          {fmt.format(total)}
                        </span>
                      </div>
                      {filas.length === 0 ? (
                        <p className="px-3 py-3 text-[12px] text-[var(--arca-ink-4)]">
                          Sin movimientos de este lado en el período.
                        </p>
                      ) : (
                        <ul className="divide-y divide-[var(--arca-border)]">
                          {filas.map((d) => {
                            const parte = total > 0 ? d.total / total : 0;
                            return (
                              <li key={d.categoria} className="px-3 py-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[12.5px] text-[var(--arca-ink)]">
                                    {CATEGORIA_MOVIMIENTO_LABEL[
                                      d.categoria as keyof typeof CATEGORIA_MOVIMIENTO_LABEL
                                    ] ?? d.categoria}
                                  </span>
                                  <span className="text-[11px] text-[var(--arca-ink-4)]">
                                    {d.movimientos}
                                  </span>
                                  <span className="ml-auto text-[12.5px] font-medium tabular-nums text-[var(--arca-ink)]">
                                    {fmt.format(d.total)}
                                  </span>
                                  <span className="w-9 text-right text-[11px] tabular-nums text-[var(--arca-ink-3)]">
                                    {Math.round(parte * 100)}%
                                  </span>
                                </div>
                                {/* La barra deja ver de un vistazo qué concepto
                                    explica la mayor parte del movimiento. */}
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--arca-surface-2)]">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.max(parte * 100, 1)}%`,
                                      background:
                                        direccion === 'ingreso'
                                          ? 'var(--arca-accent-pos-fg, oklch(0.5 0.12 145))'
                                          : 'var(--arca-accent-neg, oklch(0.55 0.18 25))',
                                    }}
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
