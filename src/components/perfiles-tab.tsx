import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  getCredencialProfiles,
  addProfileAsCliente,
  deleteCliente,
  getClienteDataCounts,
} from '@/actions/afip-profiles';
import { consumeSseStream, friendlyError } from '@/lib/sse';

/** Cliente ya dado de alta para esta credencial. */
type EnrolledProfile = Awaited<
  ReturnType<typeof getCredencialProfiles>
>['enrolled'][number];

interface NotEnrolledProfile {
  cuit: string;
  name: string;
  /** Ausente cuando viene de "Buscar en AFIP": el scrapper lo completa en el próximo job. */
  afipContribuyenteId?: number;
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export function PerfilesTab({
  representativeId,
}: {
  representativeId: string;
}) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<EnrolledProfile | null>(
    null
  );
  const [discovering, setDiscovering] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  // Resultado de "Buscar en AFIP": el endpoint de discovery no persiste nada, así que
  // mientras dure la sesión pisa a la lista que viene del último job.
  const [freshProfiles, setFreshProfiles] = useState<
    { cuit: string; name: string }[] | null
  >(null);
  const [freshAt, setFreshAt] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['representativeProfiles', representativeId],
    queryFn: () =>
      getCredencialProfiles({ data: { credencialId: representativeId } }),
  });

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ['clientDataCounts', deleteTarget?.id],
    queryFn: () =>
      getClienteDataCounts({ data: { clienteId: deleteTarget!.id } }),
    enabled: !!deleteTarget,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['representativeProfiles', representativeId],
    });
    // El selector de empresa del header lee esta query.
    void queryClient.invalidateQueries({
      queryKey: ['representativeClients', representativeId],
    });
  };

  const addMutation = useMutation({
    mutationFn: (p: NotEnrolledProfile) =>
      addProfileAsCliente({
        data: {
          credencialId: representativeId,
          cuit: p.cuit,
          razonSocial: p.name,
          afipContribuyenteId: p.afipContribuyenteId,
        },
      }),
    onSuccess: (_r, p) => {
      invalidate();
      toast.success(`${p.name} dado de alta. Se encoló el primer scrapeo.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (clienteId: string) => deleteCliente({ data: { clienteId } }),
    onSuccess: (r) => {
      invalidate();
      setDeleteTarget(null);
      toast.success(`${r.deleted} eliminado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDiscover = async () => {
    setDiscovering(true);
    setProgressMessage('Conectando con AFIP...');
    try {
      const response = await fetch('/api/afip/discover-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credencialId: representativeId }),
      });
      await consumeSseStream<{ profiles?: { cuit: string; name: string }[] }>(
        response,
        {
          onProgress: (m) => setProgressMessage(m.trim() === '' ? null : m),
          onResult: (d) => {
            setFreshProfiles(d.profiles ?? []);
            setFreshAt(new Date().toISOString());
            toast.success(`AFIP devolvió ${d.profiles?.length ?? 0} perfiles`);
          },
          onError: (m) => toast.error(m),
        }
      );
    } catch (err) {
      toast.error(
        friendlyError(
          err instanceof Error ? err.message : 'Error al buscar perfiles'
        )
      );
    } finally {
      setDiscovering(false);
      setProgressMessage(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const enrolled = data?.enrolled ?? [];
  const enrolledCuits = new Set(enrolled.map((c) => c.cuit.replace(/\D/g, '')));
  const notEnrolled: NotEnrolledProfile[] = freshProfiles
    ? freshProfiles.filter((p) => !enrolledCuits.has(p.cuit.replace(/\D/g, '')))
    : ((data?.notEnrolled ?? []) as NotEnrolledProfile[]);
  const discoveredAt = freshAt ?? data?.discoveredAt ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Perfiles dados de alta</CardTitle>
          <CardDescription>
            Solo se scrapean estas empresas. Lo que AFIP muestre y no esté acá
            se ignora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enrolled.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este representante no tiene ninguna empresa dada de alta, así que
              no se scrapea nada.
            </p>
          ) : (
            <div className="space-y-2">
              {enrolled.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {c.razonSocial}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="font-mono">{c.cuit}</span>
                      <span>Último dato: {fmtDate(c.ultimoDatoAt)}</span>
                      {c.afipContribuyenteId == null && (
                        <Badge variant="outline" className="text-xs">
                          sin id AFIP
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(c)}
                    aria-label={`Eliminar ${c.razonSocial}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Detectados en AFIP, sin dar de alta</CardTitle>
            <CardDescription>
              Última búsqueda: {fmtDate(discoveredAt)}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscover}
            disabled={discovering}
          >
            {discovering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="max-w-[220px] truncate">
                  {progressMessage ?? 'Buscando...'}
                </span>
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Buscar en AFIP
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {notEnrolled.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No se detectaron perfiles nuevos. Ejecutá &quot;Buscar en
              AFIP&quot; o esperá el próximo scrapeo.
            </p>
          ) : (
            <div className="space-y-2">
              {notEnrolled.map((p) => (
                <div
                  key={p.cuit}
                  className="flex items-center gap-3 rounded-lg border border-dashed p-3"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.cuit}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addMutation.mutate(p)}
                    disabled={addMutation.isPending}
                  >
                    {addMutation.isPending &&
                    addMutation.variables?.cuit === p.cuit ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Dar de alta
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-destructive" />
              Eliminar {deleteTarget?.razonSocial}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Se borra la empresa y todos sus datos. Esta acción no se puede
                  deshacer.
                </p>
                {countsLoading ? (
                  <p className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Calculando datos asociados...
                  </p>
                ) : (
                  counts && (
                    <ul className="list-inside list-disc text-foreground">
                      <li>{counts.comprobantes} comprobantes</li>
                      <li>{counts.deudas} deudas</li>
                      <li>{counts.declaracionesIva} períodos de IVA</li>
                      <li>{counts.notificaciones} notificaciones</li>
                      <li>{counts.empleados} empleados</li>
                    </ul>
                  )
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || countsLoading}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
