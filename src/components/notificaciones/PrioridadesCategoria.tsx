/**
 * Prioridad que el estudio le pone a cada categoría de notificación.
 *
 * La regla pisa a la del clasificador: dentro de una categoría manda el
 * criterio del estudio. Se guarda la regla y no el resultado, así que un
 * cambio se ve al instante sobre todo el historial y "Según el clasificador"
 * devuelve esa categoría a como estaba, sin haber perdido nada.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CATEGORIAS_NOTIFICACION,
  getPrioridadesCategoria,
  setPrioridadCategoria,
} from '@/actions/notification';
import { botonHeader } from '@/components/shared/filtros';
import { SEVERIDAD_LABEL, SEVERIDAD_PILL, nombreCategoria } from './utils';
import { cn } from '@/lib/utils';

/** El valor del select cuando no hay regla propia. */
const SIN_REGLA = 'clasificador';

const OPCIONES = ['urgente', 'accion_requerida', 'informativa'] as const;

export function PrioridadesCategoria() {
  const queryClient = useQueryClient();

  const { data: prioridades = {}, isLoading } = useQuery({
    queryKey: ['prioridades-categoria'],
    queryFn: () => getPrioridadesCategoria(),
  });

  const guardar = useMutation({
    mutationFn: (v: { categoria: string; severidad: string | null }) =>
      setPrioridadCategoria({
        data: {
          categoria: v.categoria as (typeof CATEGORIAS_NOTIFICACION)[number],
          severidad: v.severidad as 'urgente' | null,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['prioridades-categoria'],
      });
      // La importancia que se ve en la lista sale de esta regla.
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => toast.error('No se pudo guardar la prioridad'),
  });

  const conRegla = Object.keys(prioridades).length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={botonHeader}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Prioridades
          {conRegla > 0 && (
            <span
              className="text-[10.5px] tabular-nums"
              style={{ color: 'var(--arca-ink-4)' }}
            >
              {conRegla}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Prioridad por categoría</DialogTitle>
          <DialogDescription>
            Lo que elijas acá manda sobre la importancia que asigna el
            clasificador, y se aplica a todo el historial de esa categoría.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-8 text-[12.5px]"
            style={{ color: 'var(--arca-ink-4)' }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando
          </div>
        ) : (
          <div className="divide-y divide-[var(--arca-border)]">
            {CATEGORIAS_NOTIFICACION.map((c) => {
              const actual = prioridades[c] ?? SIN_REGLA;
              return (
                <div
                  key={c}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <span
                    className="text-[13px] truncate"
                    style={{ color: 'var(--arca-ink)' }}
                  >
                    {nombreCategoria(c)}
                  </span>
                  <Select
                    value={actual}
                    onValueChange={(v) =>
                      guardar.mutate({
                        categoria: c,
                        severidad: v === SIN_REGLA ? null : v,
                      })
                    }
                  >
                    <SelectTrigger className="w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_REGLA}>
                        Según el clasificador
                      </SelectItem>
                      {OPCIONES.map((sv) => (
                        <SelectItem key={sv} value={sv}>
                          <span
                            className={cn(
                              'inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium',
                              SEVERIDAD_PILL[sv]
                            )}
                          >
                            {SEVERIDAD_LABEL[sv]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11.5px]" style={{ color: 'var(--arca-ink-4)' }}>
          «Según el clasificador» deja esa categoría como venía: la
          clasificación original nunca se pisa en la base, sólo se muestra la
          regla encima.
        </p>
      </DialogContent>
    </Dialog>
  );
}
