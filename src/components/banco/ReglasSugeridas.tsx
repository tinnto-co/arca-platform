/**
 * Las reglas de banco que el sistema propone.
 *
 * No se crean solas: cada una dice qué hace y por qué se propone, el estudio
 * marca las que le sirven y recién ahí se guardan. Después se editan como
 * cualquier otra regla.
 *
 * La razón de que sea así y no un sembrado automático como el plan de
 * cuentas: la imputación es una decisión contable y cada estudio la toma
 * distinto. Proponer está bien; decidir por ellos, no.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearReglasBancoSugeridas,
  listarReglasBancoSugeridas,
} from '@/actions/bank-posting';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ReglasSugeridas({
  clienteId,
  abierto,
  onAbiertoChange,
}: {
  clienteId: string;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [elegidas, setElegidas] = useState<string[]>([]);

  const { data: sugeridas = [], isLoading } = useQuery({
    queryKey: ['reglasBancoSugeridas', clienteId],
    queryFn: () => listarReglasBancoSugeridas({ data: { clienteId } }),
    enabled: !!clienteId && abierto,
  });

  // Al abrir, vienen marcadas las que se pueden crear: es lo más probable
  // que quieran, y desmarcar es más rápido que marcar diez.
  const [cargado, setCargado] = useState(false);
  if (sugeridas.length > 0 && !cargado) {
    setElegidas(
      sugeridas.filter((s) => s.disponible && !s.yaExiste).map((s) => s.clave)
    );
    setCargado(true);
  }

  const crear = useMutation({
    mutationFn: () =>
      crearReglasBancoSugeridas({ data: { clienteId, claves: elegidas } }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['accounting'] });
      void queryClient.invalidateQueries({
        queryKey: ['reglasBancoSugeridas'],
      });
      toast.success(
        `${r.creadas} regla${r.creadas === 1 ? '' : 's'} creada${r.creadas === 1 ? '' : 's'}${r.salteadas > 0 ? ` · ${r.salteadas} salteada${r.salteadas === 1 ? '' : 's'}` : ''}`
      );
      onAbiertoChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = (clave: string) =>
    setElegidas((prev) =>
      prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]
    );

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reglas de banco sugeridas</DialogTitle>
          <DialogDescription>
            Marcá las que te sirvan. Son un punto de partida: después se editan
            como cualquier regla, y la cuenta de cada una se puede cambiar.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
            <Loader2 className="mx-auto size-4 animate-spin" />
          </p>
        ) : (
          <div className="max-h-[52vh] overflow-y-auto rounded-[10px] border border-[var(--arca-border)]">
            {sugeridas.map((s) => {
              const deshabilitada = !s.disponible || s.yaExiste;
              return (
                <label
                  key={s.clave}
                  className={`flex items-start gap-3 border-t border-[var(--arca-border)] px-3.5 py-2.5 first:border-t-0 ${
                    deshabilitada
                      ? 'opacity-50'
                      : 'cursor-pointer hover:bg-[var(--arca-surface-2)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-3.5 shrink-0 accent-[var(--arca-accent)]"
                    checked={elegidas.includes(s.clave)}
                    disabled={deshabilitada}
                    onChange={() => alternar(s.clave)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-[var(--arca-ink)]">
                      {s.nombre}
                      {s.yaExiste && (
                        <span className="ml-2 text-[11px] font-normal text-[var(--arca-ink-3)]">
                          ya existe
                        </span>
                      )}
                      {!s.disponible && (
                        <span className="ml-2 text-[11px] font-normal text-[var(--arca-accent-warn-fg)]">
                          falta la cuenta en el plan
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] text-[var(--arca-ink-3)]">
                      {s.conceptos.join(', ')}
                      {s.direccion
                        ? s.direccion === 'ingreso'
                          ? ' · solo lo que entra'
                          : ' · solo lo que sale'
                        : ''}
                    </span>
                    {/* Por qué se propone: sin esto es un checkbox a ciegas. */}
                    <span className="mt-0.5 block text-[11px] text-[var(--arca-ink-4)]">
                      {s.porque}
                    </span>
                    {s.cuenta && (
                      <span className="mt-0.5 block text-[11px] text-[var(--arca-ink-3)]">
                        {s.lado === 'debe' ? 'Debe' : 'Haber'} {s.cuenta} ·{' '}
                        {s.lado === 'debe' ? 'Haber' : 'Debe'} la cuenta del
                        banco
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            {elegidas.length} elegida{elegidas.length === 1 ? '' : 's'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAbiertoChange(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={elegidas.length === 0 || crear.isPending}
              onClick={() => crear.mutate()}
            >
              {crear.isPending ? 'Creando…' : `Crear ${elegidas.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
