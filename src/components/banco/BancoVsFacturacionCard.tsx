/**
 * Card "Banco vs Facturación" (TIN-1634): lo que entró al banco contra lo
 * que la empresa facturó en el mes, con semáforo. Vive en Banco y, en modo
 * compacto, en el Resumen de la ficha del cliente (con link a Banco).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Scale, ArrowRight } from 'lucide-react';
import { getBancoVsFacturacion } from '@/actions/bank';
import { MesPicker } from '@/components/shared/mes-picker';
import type { SemaforoIncongruencia } from '@/lib/extracto-calc';

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const NIVEL: Record<
  SemaforoIncongruencia,
  { bg: string; fg: string; dot: string; label: string }
> = {
  ok: {
    bg: 'var(--arca-accent-pos-bg, oklch(0.95 0.05 145))',
    fg: 'var(--arca-accent-pos-fg, oklch(0.4 0.12 145))',
    dot: 'oklch(0.55 0.12 145)',
    label: 'Sin incongruencias',
  },
  atencion: {
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
    dot: 'var(--arca-accent-warn, oklch(0.7 0.15 80))',
    label: 'Diferencia a revisar',
  },
  alerta: {
    bg: 'var(--arca-accent-neg-bg, oklch(0.95 0.04 25))',
    fg: 'var(--arca-accent-neg, oklch(0.5 0.18 25))',
    dot: 'var(--arca-accent-neg, oklch(0.55 0.18 25))',
    label: 'Incongruencia significativa',
  },
};

/** El mes anterior en 'YYYY-MM': los extractos llegan a mes vencido. */
function mesAnterior(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function BancoVsFacturacionCard({
  clienteId,
  compacto = false,
}: {
  clienteId: string;
  /** En la ficha del cliente: sin selector de mes, con link a Banco. */
  compacto?: boolean;
}) {
  const [periodo, setPeriodo] = useState(mesAnterior());

  const { data } = useQuery({
    queryKey: ['bancoVsFacturacion', clienteId, periodo],
    queryFn: () => getBancoVsFacturacion({ data: { clienteId, periodo } }),
    enabled: !!clienteId,
  });

  if (!data) return null;
  // Sin cuentas ni movimientos todavía: en la ficha no hay nada que decir;
  // en Banco sí se muestra, para que se vea qué falta cargar.
  if (compacto && data.cuentas === 0) return null;

  const sinDatos = data.movimientos === 0;
  const nivel = sinDatos ? NIVEL.ok : NIVEL[data.nivel];
  const sobra = data.diferencia > 0;

  return (
    <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="size-4 text-[var(--arca-ink-2)]" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Banco vs Facturación
        </span>
        {!compacto && (
          <div className="ml-auto">
            <MesPicker
              size="sm"
              ano={periodo.slice(0, 4)}
              mes={periodo.slice(5, 7)}
              maxPeriodo={mesAnterior()}
              onChange={(ano, mes) => setPeriodo(`${ano}-${mes}`)}
            />
          </div>
        )}
        {compacto && (
          <Link
            to="/bank"
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
          >
            Ver en Banco
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      {sinDatos ? (
        <p className="mt-3 text-[12.5px] text-[var(--arca-ink-3)]">
          {data.cuentas === 0
            ? 'La empresa no tiene cuentas bancarias cargadas. Importá un extracto para empezar a comparar.'
            : `Sin movimientos bancarios en ${periodo}. Importá el extracto del mes para comparar.`}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] text-[var(--arca-ink-3)]">
                Entró al banco
              </p>
              <p className="text-[16px] font-semibold tabular-nums text-[var(--arca-ink)]">
                {fmt.format(data.ingresosBancarios)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--arca-ink-3)]">
                Ventas facturadas
              </p>
              <p className="text-[16px] font-semibold tabular-nums text-[var(--arca-ink)]">
                {fmt.format(data.ventasFacturadas)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--arca-ink-3)]">Diferencia</p>
              <p
                className="text-[16px] font-semibold tabular-nums"
                style={{ color: nivel.fg }}
              >
                {sobra ? '+' : ''}
                {fmt.format(data.diferencia)}
                <span className="ml-1 text-[11.5px] font-normal">
                  ({data.porcentaje}%)
                </span>
              </p>
            </div>
          </div>

          <div
            className="mt-3 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12px] leading-relaxed"
            style={{ background: nivel.bg, color: nivel.fg }}
          >
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ background: nivel.dot }}
            />
            <span>
              <span className="font-semibold">{nivel.label}.</span>{' '}
              {data.nivel === 'ok'
                ? 'Los ingresos bancarios están en línea con lo facturado.'
                : sobra
                  ? `Al banco entró ${fmt.format(Math.abs(data.diferencia))} más de lo que se facturó en el mes. Puede haber ventas sin facturar, cobros de otros períodos o transferencias entre cuentas propias (excluilas desde la fila).`
                  : `Se facturó ${fmt.format(Math.abs(data.diferencia))} más de lo que entró al banco. Puede haber cobros pendientes o en efectivo.`}
            </span>
          </div>

          <p className="mt-2 text-[11px] text-[var(--arca-ink-4)]">
            {data.movimientos} movimiento{data.movimientos !== 1 ? 's' : ''} ·{' '}
            {data.comprobantes} comprobante{data.comprobantes !== 1 ? 's' : ''}
            {data.movimientosExcluidos > 0
              ? ` · ${data.movimientosExcluidos} excluidos de la comparación`
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
