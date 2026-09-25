/**
 * Los asientos que salen del mes: primero se ven, después se generan.
 *
 * La vista previa llama al mismo motor que la generación, así que lo que se
 * lee acá es exactamente lo que va a quedar en el libro diario. Nada se
 * escribe hasta que alguien toca "Generar".
 *
 * Tres estados por asiento: listo, a revisar (se genera igual, pero una parte
 * queda en "Pendiente de revisión" y traba el cierre del período) y bloqueado
 * (no se genera: falta configurar algo).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  generarAsientosBanco,
  previsualizarAsientosBanco,
  deshacerAsientosBanco,
} from '@/actions/bank-posting';
import { Button } from '@/components/ui/button';
import { ArcaCard } from '@/components/dashboard/shared';
import { AyudaIcono } from '@/components/shared/ayuda';
import { pesos } from '@/components/inicio/compartido';

/** 'YYYY-MM' → "agosto de 2026". */
function mesEnPalabras(periodo: string): string {
  const [ano, mes] = periodo.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

export function AsientosDelMes({
  clienteId,
  periodo,
  cuentaBancariaId,
}: {
  clienteId: string;
  /** El mes de la URL, 'YYYY-MM'. */
  periodo: string;
  /** Si hay una cuenta elegida en Movimientos, se respeta. */
  cuentaBancariaId?: string;
}) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState<string | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['asientosBanco', clienteId, periodo, cuentaBancariaId ?? ''],
    queryFn: () =>
      previsualizarAsientosBanco({
        data: { clienteId, periodo, cuentaBancariaId },
      }),
    enabled: !!clienteId && !!periodo,
  });

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['asientosBanco'] });
    void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
  };

  const generar = useMutation({
    mutationFn: () =>
      generarAsientosBanco({ data: { clienteId, periodo, cuentaBancariaId } }),
    onSuccess: (r) => {
      refrescar();
      toast.success(
        r.generados === 0
          ? 'No había nada para generar'
          : `${r.generados} asiento${r.generados === 1 ? '' : 's'} · ${r.movimientos} movimiento${r.movimientos === 1 ? '' : 's'}${r.aRevisar > 0 ? ` · ${r.aRevisar} con algo a revisar` : ''}`
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deshacer = useMutation({
    mutationFn: () =>
      deshacerAsientosBanco({ data: { clienteId, periodo, cuentaBancariaId } }),
    onSuccess: (r) => {
      refrescar();
      toast.success(
        r.anulados === 0
          ? 'No había asientos de este mes'
          : `${r.anulados} asiento${r.anulados === 1 ? '' : 's'} anulado${r.anulados === 1 ? '' : 's'}: sus movimientos vuelven a estar disponibles`
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const asientos = data?.asientos ?? [];
  const generables = asientos.filter((a) => !a.bloqueo);
  const aRevisar = asientos.filter((a) => a.aRevisar && !a.bloqueo).length;
  const bloqueados = asientos.filter((a) => a.bloqueo).length;
  const movimientos = asientos.reduce((s, a) => s + a.movimientos, 0);
  const trabajando = generar.isPending || deshacer.isPending;

  return (
    <ArcaCard>
      <div className="flex items-center gap-3 border-b border-[var(--arca-border)] px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Asientos de {mesEnPalabras(periodo)}
            </span>
            {isFetching && (
              <Loader2 className="size-3.5 animate-spin text-[var(--arca-ink-4)]" />
            )}
          </div>
          <div className="truncate text-[11.5px] text-[var(--arca-ink-3)]">
            {asientos.length === 0
              ? 'Nada pendiente de contabilizar'
              : `${movimientos} movimiento${movimientos === 1 ? '' : 's'} · ${asientos.length} asiento${asientos.length === 1 ? '' : 's'}`}
            {aRevisar > 0 && (
              <span className="text-[var(--arca-accent-warn-fg)]">
                {' · '}
                {aRevisar} a revisar
              </span>
            )}
            {bloqueados > 0 && (
              <span className="text-[var(--arca-accent-neg-fg)]">
                {' · '}
                {bloqueados} sin poder generar
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => deshacer.mutate()}
            disabled={trabajando}
          >
            <Undo2 className="size-3.5" strokeWidth={2} />
            Deshacer el mes
          </Button>
          <Button
            size="sm"
            onClick={() => generar.mutate()}
            disabled={trabajando || generables.length === 0}
          >
            {generar.isPending
              ? 'Generando…'
              : `Generar ${generables.length || ''}`.trim()}
          </Button>
        </div>
      </div>

      {asientos.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12.5px] text-[var(--arca-ink-3)]">
          {isFetching
            ? 'Buscando qué hay para contabilizar…'
            : 'No quedan movimientos sin contabilizar en este mes. Si querés rehacerlos, usá “Deshacer el mes”.'}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--arca-border)]">
          {asientos.map((a) => {
            const clave = `${a.cuentaBancariaId}|${a.categoria}|${a.direccion}`;
            const abiertoEste = abierto === clave;
            return (
              <li key={clave}>
                <button
                  type="button"
                  onClick={() => setAbierto(abiertoEste ? null : clave)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[var(--arca-surface-2)]"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background: a.bloqueo
                        ? 'var(--arca-accent-neg)'
                        : a.aRevisar
                          ? 'var(--arca-accent-warn)'
                          : 'var(--arca-accent-pos)',
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--arca-ink)]">
                      {a.concepto}{' '}
                      <span className="font-normal text-[var(--arca-ink-3)]">
                        {a.direccion === 'ingreso' ? '(entró)' : '(salió)'} ·{' '}
                        {a.cuentaBancaria}
                      </span>
                    </span>
                    <span className="block truncate text-[11.5px] text-[var(--arca-ink-3)]">
                      {a.movimientos} movimiento
                      {a.movimientos === 1 ? '' : 's'}
                      {a.bloqueo ? ` · ${a.bloqueo}` : ''}
                      {!a.bloqueo && a.motivo ? ` · ${a.motivo}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--arca-ink)]">
                    {pesos(a.total)}
                  </span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 text-[var(--arca-ink-4)] transition-transform ${
                      abiertoEste ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {abiertoEste && (
                  <div className="border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-5 py-2.5">
                    {a.lineas.length === 0 ? (
                      <p className="text-[12px] text-[var(--arca-ink-3)]">
                        No se genera ningún asiento hasta resolver lo de arriba.
                      </p>
                    ) : (
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                            <th className="pb-1 text-left">Cuenta</th>
                            <th className="w-[130px] pb-1 text-right">Debe</th>
                            <th className="w-[130px] pb-1 text-right">Haber</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.lineas.map((l, i) => (
                            <tr key={i} className="text-[var(--arca-ink)]">
                              <td className="py-0.5">{l.cuenta}</td>
                              <td className="py-0.5 text-right tabular-nums">
                                {l.debe > 0 ? pesos(l.debe) : '—'}
                              </td>
                              <td className="py-0.5 text-right tabular-nums">
                                {l.haber > 0 ? pesos(l.haber) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-1.5 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-5 py-2.5 text-[11.5px] text-[var(--arca-ink-3)]">
        Un asiento por mes, concepto y cuenta bancaria.
        <AyudaIcono texto="Los movimientos del mes se suman por concepto y por cuenta bancaria: 36 débitos del impuesto al cheque son un solo asiento. Lo que ya se contabilizó no vuelve a entrar, así que generar dos veces no duplica nada. Lo que ninguna regla cubre va a «Pendiente de revisión», que traba el cierre del período hasta que alguien lo resuelva." />
      </div>
    </ArcaCard>
  );
}
