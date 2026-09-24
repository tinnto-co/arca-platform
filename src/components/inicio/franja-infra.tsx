/**
 * Franja de infraestructura: lo que impide ver (credenciales caídas).
 * Se oculta por completo cuando no hay problemas.
 *
 * Es una card blanca con una barra roja de 4px a la izquierda, no un bloque
 * rosa a sangre: el rojo sólido queda para el borde y el botón de la acción,
 * que es donde tiene que llamar la atención.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getCredentialAlerts,
  getDelegacionesFaltantes,
} from '@/actions/dashboard';
import {
  SERVICIO_AFIP_LABEL,
  SERVICIO_AFIP_TAB,
} from '@/lib/delegaciones-afip';
import { updateCredencialPassword } from '@/actions/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Alerta = Awaited<ReturnType<typeof getCredentialAlerts>>[number];

export function FranjaInfra() {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState<Alerta | null>(null);
  const [clave, setClave] = useState('');
  const queryClient = useQueryClient();

  const { data: alertas = [] } = useQuery({
    queryKey: ['credentialAlerts'],
    queryFn: () => getCredentialAlerts(),
    refetchInterval: 60_000,
  });

  const { data: faltantes = [] } = useQuery({
    queryKey: ['delegacionesFaltantes'],
    queryFn: () => getDelegacionesFaltantes(),
    refetchInterval: 300_000,
  });
  const [faltantesAbierto, setFaltantesAbierto] = useState(false);

  const actualizar = useMutation({
    mutationFn: (data: { id: string; password: string }) =>
      updateCredencialPassword({ data }),
    onSuccess: () => {
      toast.success('Clave actualizada');
      void queryClient.invalidateQueries({ queryKey: ['credentialAlerts'] });
      setEditando(null);
      setClave('');
    },
    onError: () => toast.error('No se pudo actualizar la clave'),
  });

  if (alertas.length === 0 && faltantes.length === 0) return null;

  return (
    <>
      {alertas.length > 0 && (
        <div className="mx-9 mt-4 flex items-center gap-3 rounded-lg border border-l-4 border-[oklch(0.85_0.08_25)] border-l-[var(--arca-accent-neg)] bg-[var(--arca-surface)] px-[14px] py-[10px]">
          <span className="size-2 shrink-0 rounded-full bg-[var(--arca-accent-neg)]" />
          <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--arca-ink-2)]">
            <span className="font-semibold text-[var(--arca-ink)]">
              ARCA rechaza {alertas.length} clave
              {alertas.length !== 1 ? 's' : ''} fiscal
              {alertas.length !== 1 ? 'es' : ''}
            </span>
            {alertas.length !== 1
              ? ' · no se traen datos nuevos de esas empresas hasta actualizarlas'
              : ' · no se traen datos nuevos de esa empresa hasta actualizarla'}
          </p>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            {/* El search pre-filtra la lista a las claves inválidas: sin esto el
            link deja al usuario buscando cuáles eran entre todos los
            clientes. Viene de staging. */}
            <Link to="/clients" search={{ filtro: 'claves_invalidas' }}>
              Ver empresas
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setAbierta(true)}
            className="shrink-0"
          >
            Actualizar claves
          </Button>

          <Dialog
            open={abierta}
            onOpenChange={(o) => {
              setAbierta(o);
              if (!o) {
                setEditando(null);
                setClave('');
              }
            }}
          >
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Claves fiscales rechazadas por ARCA</DialogTitle>
                <DialogDescription>
                  ARCA no acepta la clave de estas empresas. Hasta cargar la
                  clave nueva no se traen datos nuevos de ellas.
                </DialogDescription>
              </DialogHeader>
              <div className="divide-y divide-[var(--arca-border)] max-h-[50vh] overflow-y-auto">
                {alertas.map((a) => (
                  <div key={a.alertaId} className="py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--arca-ink)] truncate">
                          {a.nombre ?? '(sin nombre)'}
                        </div>
                        <div className="text-[11px] text-[var(--arca-ink-4)] font-mono">
                          {a.cuit}
                        </div>
                      </div>
                      {a.credencialId &&
                        (editando?.alertaId === a.alertaId ? null : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setClave('');
                              setEditando(a);
                            }}
                          >
                            <KeyRound size={13} />
                            Actualizar
                          </Button>
                        ))}
                    </div>
                    {editando?.alertaId === a.alertaId && (
                      <form
                        className="mt-2 flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editando.credencialId || !clave.trim()) return;
                          actualizar.mutate({
                            id: editando.credencialId,
                            password: clave.trim(),
                          });
                        }}
                      >
                        <Input
                          type="password"
                          placeholder="Nueva clave fiscal"
                          value={clave}
                          onChange={(e) => setClave(e.target.value)}
                          autoFocus
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!clave.trim() || actualizar.isPending}
                        >
                          {actualizar.isPending && (
                            <Loader2 size={13} className="animate-spin" />
                          )}
                          Guardar
                        </Button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Empresas que AFIP no le muestra a su credencial para algún servicio:
        el trámite es del estudio (delegar en Administrador de Relaciones),
        así que se avisa acá y no en una solapa vacía. */}
      {faltantes.length > 0 && (
        <div className="mx-9 mt-2 flex items-center gap-3 rounded-lg border border-l-4 border-[var(--arca-border)] border-l-[var(--arca-accent-warn)] bg-[var(--arca-surface)] px-[14px] py-[10px]">
          <span className="size-2 shrink-0 rounded-full bg-[var(--arca-accent-warn)]" />
          <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--arca-ink-2)]">
            <span className="font-semibold text-[var(--arca-ink)]">
              {faltantes.length} empresa{faltantes.length !== 1 ? 's' : ''} sin
              conectar en AFIP
            </span>
            {' · falta delegarles un servicio a su credencial'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setFaltantesAbierto(true)}
          >
            Ver detalle
          </Button>

          <Dialog open={faltantesAbierto} onOpenChange={setFaltantesAbierto}>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Empresas sin conectar en AFIP</DialogTitle>
                <DialogDescription>
                  AFIP no le muestra estas empresas a su credencial para el
                  servicio indicado. Se resuelve delegando el servicio en
                  «Administrador de Relaciones de Clave Fiscal» — la plataforma
                  lo detecta sola en la próxima actualización.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[50vh] divide-y divide-[var(--arca-border)] overflow-y-auto">
                {faltantes.map((f) => (
                  <div
                    key={`${f.clienteId}-${f.credencialId}`}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[var(--arca-ink)]">
                        {f.razonSocial}
                      </div>
                      <div className="text-[11px] text-[var(--arca-ink-3)]">
                        credencial {f.credencialNombre ?? '—'} · falta:{' '}
                        <span className="font-medium text-[var(--arca-accent-warn-fg)]">
                          {f.servicios
                            .map((sv) => SERVICIO_AFIP_LABEL[sv] ?? sv)
                            .join(', ')}
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: f.credencialId }}
                        search={{
                          empresa: f.clienteId,
                          tab: (SERVICIO_AFIP_TAB[f.servicios[0]] ??
                            'resumen') as never,
                        }}
                        onClick={() => setFaltantesAbierto(false)}
                      >
                        Ver ficha
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </>
  );
}
