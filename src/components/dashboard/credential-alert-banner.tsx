import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCredentialAlerts } from '@/actions/dashboard';
import { updateCredencialPassword } from '@/actions/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CredentialAlert = Awaited<ReturnType<typeof getCredentialAlerts>>[number];

export function CredentialAlertBanner() {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<CredentialAlert | null>(null);
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ['credentialAlerts'],
    queryFn: () => getCredentialAlerts(),
    refetchInterval: 60_000,
  });

  const updatePasswordMutation = useMutation({
    mutationFn: (data: { id: string; password: string }) =>
      updateCredencialPassword({ data }),
    onSuccess: () => {
      toast.success('Contrasena actualizada correctamente');
      void queryClient.invalidateQueries({ queryKey: ['credentialAlerts'] });
      setSelected(null);
      setPassword('');
    },
    onError: () => {
      toast.error('Error al actualizar la contrasena');
    },
  });

  const handleSubmit = () => {
    if (!selected?.credencialId || !password.trim()) return;
    updatePasswordMutation.mutate({
      id: selected.credencialId,
      password: password.trim(),
    });
  };

  if (alerts.length === 0) return null;

  return (
    <div
      className="mb-3.5 rounded-[12px] border overflow-hidden"
      style={{
        background: 'var(--arca-accent-neg-bg)',
        borderColor: 'var(--arca-accent-neg)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <span
          className="inline-flex items-center justify-center rounded-[8px] w-9 h-9 shrink-0"
          style={{ background: 'var(--arca-accent-neg)', color: '#fff' }}
        >
          <KeyRound size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] font-semibold leading-tight"
            style={{ color: 'var(--arca-accent-neg)' }}
          >
            {alerts.length} credencial{alerts.length !== 1 ? 'es' : ''} con clave
            invalida
          </div>
          <div className="text-[11px] text-[var(--arca-ink-3)] leading-tight mt-0.5">
            No se scrappean hasta que se actualicen las claves
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-[var(--arca-ink-4)] shrink-0" />
        ) : (
          <ChevronDown
            size={16}
            className="text-[var(--arca-ink-4)] shrink-0"
          />
        )}
      </button>

      {expanded && (
        <div
          className="px-4 pb-3 border-t"
          style={{ borderColor: 'var(--arca-accent-neg)' }}
        >
          <table className="w-full text-[12.5px] mt-2">
            <thead>
              <tr className="border-b border-[var(--arca-border)]">
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-1.5">
                  Credencial
                </th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-1.5">
                  Motivo
                </th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.alertaId}
                  className="border-b border-[var(--arca-border)] last:border-0"
                >
                  <td className="py-1.5">
                    <div className="font-medium text-[var(--arca-ink)]">
                      {a.nombre ?? '(sin nombre)'}
                    </div>
                    <div className="text-[11px] text-[var(--arca-ink-4)] font-mono">
                      {a.cuit}
                    </div>
                  </td>
                  <td className="py-1.5 text-[var(--arca-ink-3)]">
                    {a.descripcion ?? 'Credenciales invalidas'}
                  </td>
                  <td className="py-1.5 text-right">
                    {a.credencialId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPassword('');
                          setSelected(a);
                        }}
                      >
                        <KeyRound size={13} />
                        Actualizar clave
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setPassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Actualizar clave fiscal</DialogTitle>
            <DialogDescription>
              {selected?.nombre ?? '(sin nombre)'} · {selected?.cuit}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <Input
              type="password"
              placeholder="Nueva contrasena de AFIP"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={updatePasswordMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!password.trim() || updatePasswordMutation.isPending}
              >
                {updatePasswordMutation.isPending && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
