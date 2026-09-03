/**
 * Claves que scrapean comprobantes y vuelven vacías, con el selector de
 * frecuencia (estándar / semanal / pausada).
 *
 * El scrapeo de comprobantes es el 83% del gasto de proxy y va por
 * credencial: el job recorre todas las empresas del login. Por eso acá se
 * listan solo las claves 100% vacías (ninguna empresa activa con un solo
 * comprobante) — las «mixtas» no son candidatas, su job corre igual — más
 * las ya espaciadas, para poder revertirlas. La decisión es de una persona,
 * no un automatismo: una empresa puede empezar a facturar cualquier mes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getClavesParaEspaciar,
  updateComprobantesFrecuencia,
  type FrecuenciaComprobantes,
} from '@/actions/client';

/** Debajo de esto, el «vacía» no es confiable todavía. */
const SCRAPEOS_MINIMOS = 30;

const FRECUENCIA_LABEL: Record<FrecuenciaComprobantes, string> = {
  estandar: 'Estándar',
  semanal: 'Semanal (lunes)',
  pausada: 'Pausada',
};

export function FrecuenciaClavesCard() {
  const queryClient = useQueryClient();

  const { data: claves = [] } = useQuery({
    queryKey: ['claves-espaciar'],
    queryFn: () => getClavesParaEspaciar(),
    staleTime: 60_000,
  });

  const cambiar = useMutation({
    mutationFn: (v: {
      credencialId: string;
      frecuencia: FrecuenciaComprobantes;
    }) => updateComprobantesFrecuencia({ data: v }),
    onSuccess: (_, v) => {
      toast.success(
        `Comprobantes de la clave: ${FRECUENCIA_LABEL[v.frecuencia].toLowerCase()}`
      );
      void queryClient.invalidateQueries({ queryKey: ['claves-espaciar'] });
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo cambiar'),
  });

  // Sin candidatas ni claves espaciadas no hay decisión que tomar: la card
  // no aparece.
  if (claves.length === 0) return null;

  return (
    <div className="mt-6 bg-white border border-[var(--arca-border)] rounded-[14px] overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-[var(--arca-border)]">
        <Gauge className="h-4 w-4 mt-0.5 shrink-0 text-[var(--arca-ink-3)]" />
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            Claves que scrapean y vuelven vacías
          </h2>
          <p className="text-[12px] text-[var(--arca-ink-3)] mt-0.5 max-w-[75ch]">
            Ninguna de sus empresas activas tiene comprobantes: espaciar su
            scrapeo ahorra proxy sin perder datos. <strong>Semanal</strong> es
            la opción segura (si empiezan a facturar, te enterás el lunes);{' '}
            <strong>pausada</strong> es para claves que el estudio sabe
            inactivas — pausada no hay forma de enterarse de que volvieron a
            facturar. Solo afecta comprobantes: notificaciones, deuda e IVA
            siguen normal.
          </p>
        </div>
      </div>

      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <th className="px-5 py-2 text-left font-semibold text-[var(--arca-ink-2)]">
              Clave
            </th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--arca-ink-2)]">
              Empresas
            </th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--arca-ink-2)]">
              Con comprobantes
            </th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--arca-ink-2)]">
              Scrapeos OK
            </th>
            <th className="px-5 py-2 text-right font-semibold text-[var(--arca-ink-2)]">
              Frecuencia
            </th>
          </tr>
        </thead>
        <tbody>
          {claves.map((c) => (
            <tr
              key={c.id}
              className="border-b border-[var(--arca-border)] last:border-0"
            >
              <td className="px-5 py-2.5">
                <div className="font-medium text-[var(--arca-ink)]">
                  {c.nombre ?? '(sin nombre)'}
                </div>
                <div className="text-[11px] text-[var(--arca-ink-4)] [font-family:var(--ff-mono)]">
                  {c.cuit}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--arca-ink-2)]">
                {c.empresas}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--arca-ink-2)]">
                {c.conComprobantes}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                <span className="text-[var(--arca-ink-2)]">{c.scrapeosOk}</span>
                {c.scrapeosOk < SCRAPEOS_MINIMOS && (
                  <span
                    className="ml-1.5 rounded-[20px] px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={{
                      background: 'var(--arca-accent-warn-bg)',
                      color: 'var(--arca-accent-warn-fg)',
                    }}
                    title="Pocos scrapeos: el «vacía» todavía no es confiable. Puede ser una clave recién agregada."
                  >
                    historial corto
                  </span>
                )}
              </td>
              <td className="px-5 py-2.5 text-right">
                <Select
                  value={c.frecuencia}
                  disabled={cambiar.isPending}
                  onValueChange={(v) =>
                    cambiar.mutate({
                      credencialId: c.id,
                      frecuencia: v as FrecuenciaComprobantes,
                    })
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-[160px] ml-auto text-[12px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(FRECUENCIA_LABEL) as [
                        FrecuenciaComprobantes,
                        string,
                      ][]
                    ).map(([valor, label]) => (
                      <SelectItem key={valor} value={valor}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
