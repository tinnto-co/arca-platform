/**
 * Franja de infraestructura: lo que impide ver (credenciales caídas).
 * Se oculta por completo cuando no hay problemas. Full width, sin radio:
 * no es una card, es el techo de la pantalla.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCredentialAlerts } from '@/actions/dashboard';
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

  if (alertas.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 border-b"
      style={{
        background: 'var(--arca-accent-neg-bg)',
        borderColor: 'var(--arca-border-strong)',
        padding: '10px 36px',
      }}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ background: 'var(--arca-accent-neg)' }}
      />
      <p
        className="flex-1 text-[12.5px] min-w-0 truncate"
        style={{ color: 'var(--arca-accent-neg-fg)' }}
      >
        <span className="font-semibold">
          {alertas.length} credencial{alertas.length !== 1 ? 'es' : ''} con
          clave inválida
        </span>
        {' · no se scrapean hasta actualizarlas'}
      </p>
      <Link
        to="/clients"
        className="text-[12px] shrink-0 hover:underline"
        style={{ color: 'var(--arca-accent-neg-fg)' }}
      >
        Ver empresas
      </Link>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="shrink-0 text-[12px] font-medium bg-white border rounded-[10px] cursor-pointer transition-colors duration-150 hover:bg-[var(--arca-surface-2)]"
        style={{
          borderColor: 'var(--arca-border-strong)',
          color: 'var(--arca-ink)',
          padding: '4px 11px',
        }}
      >
        Actualizar claves
      </button>

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
            <DialogTitle>Credenciales con clave inválida</DialogTitle>
            <DialogDescription>
              AFIP rechaza el login: no se scrapean hasta cargar la clave nueva.
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
  );
}
