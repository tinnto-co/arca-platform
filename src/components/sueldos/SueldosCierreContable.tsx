'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Eye,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  cerrarLiquidacionPeriodo,
  getCierreLiquidacion,
  previewAsientoLiquidacion,
  reabrirLiquidacionPeriodo,
} from '@/actions/sueldos';

interface Props {
  /** Representante (agrupador). */
  clientId: string;
  /** Empresa con CUIT propio. */
  profileId: string;
  periodo: string;
}

type PreviewResult = Awaited<ReturnType<typeof previewAsientoLiquidacion>>;

const money = (n: number) =>
  n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado';

/**
 * Cierre contable de la liquidación del período (US 3.3.1): previsualiza y
 * genera el asiento automático `auto_payroll`, o lo reabre.
 */
export function SueldosCierreContable({ clientId, profileId, periodo }: Props) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const { data: estado, isLoading } = useQuery({
    queryKey: ['cierreLiquidacion', clientId, profileId, periodo],
    queryFn: () =>
      getCierreLiquidacion({ data: { clientId, profileId, periodo } }),
  });

  const cerrado = estado?.cierre ?? null;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['cierreLiquidacion', clientId, profileId, periodo],
    });

  const previewMut = useMutation({
    mutationFn: () =>
      previewAsientoLiquidacion({ data: { clientId, profileId, periodo } }),
    onSuccess: (r) => setPreview(r),
    onError: (e) => {
      setPreview(null);
      toast.error(errMsg(e));
    },
  });

  const cerrarMut = useMutation({
    mutationFn: () =>
      cerrarLiquidacionPeriodo({ data: { clientId, profileId, periodo } }),
    onSuccess: (r) => {
      setConfirmOpen(false);
      setPreview(null);
      void invalidate();
      toast.success(
        `Asiento N.º ${r.entryNumber} generado para ${r.periodo}.` +
          (r.conceptosSinRegla > 0
            ? ` ${r.conceptosSinRegla} concepto(s) quedaron en Pendiente de revisión.`
            : '')
      );
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast.error(errMsg(e));
    },
  });

  const reabrirMut = useMutation({
    mutationFn: () =>
      reabrirLiquidacionPeriodo({ data: { clientId, profileId, periodo } }),
    onSuccess: () => {
      setReopenOpen(false);
      void invalidate();
      toast.success(`Liquidación de ${periodo} reabierta. El asiento fue anulado.`);
    },
    onError: (e) => {
      setReopenOpen(false);
      toast.error(errMsg(e));
    },
  });

  const busy =
    previewMut.isPending || cerrarMut.isPending || reabrirMut.isPending;

  const totalDebe = preview?.lines.reduce((s, l) => s + l.debit, 0) ?? 0;
  const totalHaber = preview?.lines.reduce((s, l) => s + l.credit, 0) ?? 0;

  return (
    <div className="border border-[#ECEAE3] rounded-[12px] bg-white p-5 mb-[44px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <BookOpen style={{ width: 15, height: 15, color: '#9B9CA3' }} />
            <span
              style={{ fontSize: '12.5px', color: '#6E7079', fontWeight: 500 }}
            >
              Cierre contable
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[#6E7079]">
            {isLoading
              ? 'Consultando estado…'
              : cerrado
                ? `Liquidación de ${periodo} cerrada. Asiento N.º ${cerrado.entryNumber ?? '—'} sobre ${cerrado.recibos} recibo(s).`
                : `Genera un único asiento con los recibos confirmados de ${periodo}.`}
          </p>
          {cerrado && cerrado.conceptosSinRegla > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#B45309]">
              <AlertTriangle style={{ width: 13, height: 13 }} />
              {cerrado.conceptosSinRegla} concepto(s) sin regla fueron a
              Pendiente de revisión.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {cerrado ? (
            <>
              <Link
                to="/accounting"
                search={{ clientId: profileId, tab: 'asientos' }}
                className="inline-flex items-center gap-2 border border-[#DFDCD3] bg-white text-[#12131A] rounded-[10px] px-[15px] py-[9px] text-[13.5px] font-medium hover:bg-[#FBFAF6] transition-colors"
              >
                <BookOpen style={{ width: 15, height: 15 }} />
                Ver en el diario
              </Link>
              <button
                type="button"
                onClick={() => setReopenOpen(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 border border-[#DFDCD3] bg-white text-[#12131A] rounded-[10px] px-[15px] py-[9px] text-[13.5px] font-medium hover:bg-[#FBFAF6] transition-colors disabled:opacity-50"
              >
                {reabrirMut.isPending ? (
                  <Loader2
                    style={{ width: 15, height: 15 }}
                    className="animate-spin"
                  />
                ) : (
                  <Unlock style={{ width: 15, height: 15 }} />
                )}
                Reabrir
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => previewMut.mutate()}
                disabled={busy}
                className="inline-flex items-center gap-2 border border-[#DFDCD3] bg-white text-[#12131A] rounded-[10px] px-[15px] py-[9px] text-[13.5px] font-medium hover:bg-[#FBFAF6] transition-colors disabled:opacity-50"
              >
                {previewMut.isPending ? (
                  <Loader2
                    style={{ width: 15, height: 15 }}
                    className="animate-spin"
                  />
                ) : (
                  <Eye style={{ width: 15, height: 15 }} />
                )}
                Previsualizar asiento
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                className="inline-flex items-center gap-2 bg-[#12131A] text-white rounded-[10px] px-[17px] py-[10px] text-[13.5px] font-semibold hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cerrarMut.isPending ? (
                  <Loader2
                    style={{ width: 15, height: 15 }}
                    className="animate-spin"
                  />
                ) : (
                  <Lock style={{ width: 15, height: 15 }} />
                )}
                Cerrar y generar asiento
              </button>
            </>
          )}
        </div>
      </div>

      {preview && !cerrado && (
        <div className="mt-5 border-t border-[#ECEAE3] pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[12.5px] text-[#6E7079]">
            <span className="font-medium text-[#12131A]">
              Previsualización — {preview.periodo}
            </span>
            <span>·</span>
            <span>{preview.recibos} recibo(s)</span>
            <span>·</span>
            <span>{preview.conceptos} concepto(s)</span>
            {preview.pendingReview ? (
              <span className="inline-flex items-center gap-1.5 text-[#B45309]">
                <AlertTriangle style={{ width: 13, height: 13 }} />
                {preview.reason}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#15803D]">
                <CheckCircle2 style={{ width: 13, height: 13 }} />
                Todos los conceptos tienen regla
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-[#9B9CA3]">
                  <th className="py-1.5 pr-3 font-medium">Cuenta</th>
                  <th className="py-1.5 pr-3 font-medium">Detalle</th>
                  <th className="py-1.5 pl-3 font-medium text-right">Debe</th>
                  <th className="py-1.5 pl-3 font-medium text-right">Haber</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l, i) => (
                  <tr key={i} className="border-t border-[#ECEAE3]">
                    <td className="py-1.5 pr-3 text-[#12131A]">
                      <span className="font-[family-name:var(--ff-mono)] text-[12px] text-[#6E7079]">
                        {l.accountCode ?? '—'}
                      </span>{' '}
                      {l.accountName ?? 'Cuenta desconocida'}
                    </td>
                    <td className="py-1.5 pr-3 text-[#6E7079]">
                      {l.description ?? ''}
                    </td>
                    <td className="py-1.5 pl-3 text-right text-[#12131A]">
                      {l.debit ? money(l.debit) : ''}
                    </td>
                    <td className="py-1.5 pl-3 text-right text-[#12131A]">
                      {l.credit ? money(l.credit) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#DFDCD3] font-semibold text-[#12131A]">
                  <td className="py-1.5 pr-3" colSpan={2}>
                    Totales
                  </td>
                  <td className="py-1.5 pl-3 text-right">{money(totalDebe)}</td>
                  <td className="py-1.5 pl-3 text-right">{money(totalHaber)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {preview.conceptosSinRegla > 0 && (
            <p className="mt-3 text-[12.5px] text-[#B45309]">
              Conceptos sin regla:{' '}
              {preview.mappings
                .filter((m) => m.unmapped)
                .map((m) => m.codigo)
                .join(', ')}
              . Configurá reglas de mapeo de sueldos para imputarlos a sus
              cuentas.
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar la liquidación de {periodo}</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará un asiento contable con los recibos confirmados del
              período. Los conceptos sin regla se imputan a Pendiente de
              revisión, lo que bloquea el cierre del período contable hasta
              corregirlos. Podés reabrir la liquidación después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cerrarMut.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cerrarMut.mutate();
              }}
              disabled={cerrarMut.isPending}
            >
              {cerrarMut.isPending ? 'Generando…' : 'Cerrar y generar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir la liquidación de {periodo}</AlertDialogTitle>
            <AlertDialogDescription>
              El asiento generado se marcará como anulado (no se borra, queda
              como historial) y vas a poder volver a cerrar el período.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reabrirMut.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                reabrirMut.mutate();
              }}
              disabled={reabrirMut.isPending}
            >
              {reabrirMut.isPending ? 'Reabriendo…' : 'Reabrir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
