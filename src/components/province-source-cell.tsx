import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateContraparteProvincia } from '@/actions/comprobante';
import {
  PROVINCE_LABELS,
  PROVINCE_SOURCE_LABELS,
  type ProvinceLabel,
} from '@/lib/provinces';

// ─── Provincia del receptor: fuente + corrección manual ──────────────
interface ProvinceSourceInvoice {
  contraparteDocNro: string | null;
  contraparteNombre: string | null;
  provincia: string | null;
  provinciaFuente: string | null;
  provinciaActualizadaAt: string | Date | null;
}

export function ProvinceSourceCell({ inv }: { inv: ProvinceSourceInvoice }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [province, setProvince] = useState<string>('');

  const mutation = useMutation({
    mutationFn: () =>
      updateContraparteProvincia({
        data: {
          docNro: inv.contraparteDocNro ?? '',
          provincia: province as ProvinceLabel,
        },
      }),
    onSuccess: async (res) => {
      setOpen(false);
      // La provincia vive sólo en la contraparte: no hay comprobantes que
      // actualizar en cascada.
      toast.success(`Provincia corregida a ${res.provincia}`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['clientMultilateralInvoices'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['clientMultilateralSummary'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['clientMultilateralSummaryPrev'],
        }),
      ]);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : 'Error al corregir la provincia'
      ),
  });

  const sourceLabel = inv.provinciaFuente
    ? (PROVINCE_SOURCE_LABELS[inv.provinciaFuente] ?? inv.provinciaFuente)
    : '—';
  const fetchedAt = inv.provinciaActualizadaAt
    ? new Date(inv.provinciaActualizadaAt).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span
        className="text-[11px] text-muted-foreground whitespace-nowrap"
        title={fetchedAt ? `Dato obtenido el ${fetchedAt}` : undefined}
      >
        {sourceLabel}
        {fetchedAt ? ` · ${fetchedAt}` : ''}
      </span>
      {inv.contraparteDocNro ? (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) setProvince(inv.provincia ?? '');
          }}
        >
          <PopoverTrigger asChild>
            <button
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Corregir provincia"
              aria-label="Corregir provincia"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-3" align="end">
            <p className="text-xs text-muted-foreground">
              Corregir provincia de{' '}
              <span className="font-medium text-foreground">
                {inv.contraparteNombre?.trim()
                  ? inv.contraparteNombre
                  : inv.contraparteDocNro}
              </span>
              . Se aplica a todas sus facturas emitidas y no será pisada por el
              proceso automático.
            </p>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Provincia" />
              </SelectTrigger>
              <SelectContent>
                {PROVINCE_LABELS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="w-full h-8"
              disabled={!province || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Guardar'
              )}
            </Button>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
